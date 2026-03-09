import Foundation
import Observation

@MainActor @Observable
class DashboardViewModel {
    var assets: [Asset] = []
    var transactions: [String: [Transaction]] = [:] // assetId -> transactions
    var holdings: [PortfolioHolding] = []
    var totalValue: Double = 0
    var previousValue: Double?
    var valueChange: ValueChange?
    var breakdown: [AssetCategory: Double] = [:]
    var riskScore: RiskScore = RiskScore(value: 0, label: "No Assets")
    var projectionPreview: Projection?
    var isLoading = true
    var priceError: String?
    var currencyCode: String = "USD"
    var lastUpdated: Date?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    func refresh(baseCurrency: String = "USD") async {
        currencyCode = baseCurrency
        isLoading = true
        priceError = nil

        // Fetch assets from API
        do {
            let response: AssetListResponse = try await UserAPIClient.shared.get(path: "/user/assets")
            assets = response.assets
        } catch {
            print("[Summa] Failed to fetch assets: \(error)")
            if assets.isEmpty {
                isLoading = false
                return
            }
        }

        // Fetch transactions for all assets
        for asset in assets {
            do {
                let response: TransactionListResponse = try await UserAPIClient.shared.get(path: "/user/assets/\(asset.id)/transactions")
                transactions[asset.id] = response.transactions
            } catch {
                print("[Summa] Failed to fetch transactions for \(asset.id): \(error)")
            }
        }

        guard !assets.isEmpty else {
            holdings = []
            totalValue = 0
            previousValue = nil
            valueChange = nil
            breakdown = [:]
            riskScore = RiskScore(value: 0, label: "No Assets")
            projectionPreview = nil
            lastUpdated = nil
            priceError = nil
            isLoading = false
            return
        }

        // Fetch prices from API
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: baseCurrency
            )

            let priceMap = Dictionary(prices.map { ($0.id, $0.price) }, uniquingKeysWith: { _, last in last })

            lastUpdated = Date()

            let missingPrices = assets.filter { priceMap[$0.symbol] == nil }
            if !missingPrices.isEmpty {
                let symbols = missingPrices.map(\.symbol).joined(separator: ", ")
                print("[Summa] Missing prices for: \(symbols)")
                priceError = PriceErrorMessage.partialFailureMessage
            }

            holdings = assets.map { asset in
                PortfolioHolding(
                    id: asset.id,
                    name: asset.name,
                    symbol: asset.symbol,
                    amount: asset.currentAmount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            print("[Summa] Price fetch failed: \(error)")
            priceError = PriceErrorMessage.userMessage(from: error)
            // Use zero prices on error -- user still sees their assets
            holdings = assets.map { asset in
                PortfolioHolding(
                    id: asset.id,
                    name: asset.name,
                    symbol: asset.symbol,
                    amount: asset.currentAmount,
                    pricePerUnit: 0,
                    category: asset.assetCategory
                )
            }
        }

        totalValue = PortfolioCalculator.totalValue(holdings: holdings)
        breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        riskScore = RiskCalculator.riskScore(holdings: holdings)
        projectionPreview = ProjectionEngine.project(holdings: holdings, years: 10)

        // Fetch recent history to compute previous day's value
        previousValue = await fetchPreviousValue(assets: assets, currency: baseCurrency)
        valueChange = PortfolioCalculator.valueChange(currentValue: totalValue, previousValue: previousValue)

        isLoading = false
    }

    /// Fetch the most recent prior day's portfolio value from history API
    private func fetchPreviousValue(assets: [Asset], currency: String) async -> Double? {
        let calendar = PortfolioCalculator.utcCalendar
        let today = Date()
        guard let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: today) else { return nil }

        let assetParams = assets.map { (id: $0.symbol, category: $0.category) }

        do {
            let history = try await PriceAPIClient.shared.fetchHistory(
                assets: assetParams,
                from: sevenDaysAgo,
                to: today,
                currency: currency.lowercased()
            )

            // Compute daily totals, find the most recent day before today
            let todayString = Self.dateFormatter.string(from: today)

            // Collect all dates across all assets
            var allDates = Set<String>()
            for (_, points) in history {
                for point in points {
                    allDates.insert(point.date)
                }
            }

            // Sort dates descending (most recent first) and filter to before today
            let sortedDates = allDates.sorted(by: >).filter { $0 < todayString }
            guard !sortedDates.isEmpty else { return nil }

            // Pre-compute sorted transactions for each asset
            let assetTransactions: [(asset: Asset, sortedTxns: [Transaction])] = assets.map { asset in
                let txns = (transactions[asset.id] ?? []).sorted { $0.parsedDate < $1.parsedDate }
                return (asset, txns)
            }

            // Build per-asset price maps for assets that have history
            var assetsWithHistory: [(asset: Asset, sortedTxns: [Transaction], priceMap: [String: Double])] = []
            var assetsWithoutHistory: [(asset: Asset, sortedTxns: [Transaction], currentPrice: Double)] = []

            for (asset, sortedTxns) in assetTransactions {
                let compositeKey = "\(asset.symbol):\(asset.category)"
                if let assetHistory = history[compositeKey] {
                    let priceMap = Dictionary(assetHistory.map { ($0.date, $0.price) }, uniquingKeysWith: { _, last in last })
                    assetsWithHistory.append((asset, sortedTxns, priceMap))
                } else {
                    // Assets without history (e.g. fiat) use current holding price
                    let holding = holdings.first(where: { $0.id == asset.id })
                    let price = holding?.pricePerUnit ?? 0
                    assetsWithoutHistory.append((asset, sortedTxns, price))
                }
            }

            guard !assetsWithHistory.isEmpty else { return nil }

            // Find the most recent date where all assets with history have a price
            for candidateDate in sortedDates {
                guard let candidateDateParsed = Self.dateFormatter.date(from: candidateDate) else { continue }

                var dayTotal = 0.0
                var allHavePrice = true
                for (asset, sortedTxns, priceMap) in assetsWithHistory {
                    guard let price = priceMap[candidateDate] else {
                        allHavePrice = false
                        break
                    }
                    let amount = PortfolioCalculator.amountAtDate(date: candidateDateParsed, transactions: sortedTxns, fallbackAmount: asset.amount)
                    dayTotal += price * amount
                }

                if allHavePrice {
                    // Include assets without history (e.g. fiat) at their current price
                    for (asset, sortedTxns, currentPrice) in assetsWithoutHistory {
                        let amount = PortfolioCalculator.amountAtDate(date: candidateDateParsed, transactions: sortedTxns, fallbackAmount: asset.amount)
                        dayTotal += currentPrice * amount
                    }
                    return dayTotal > 0 ? dayTotal : nil
                }
            }

            // No date found where assets with history all have prices
            return nil
        } catch {
            print("[Summa] History fetch for change indicator failed: \(error)")
            return nil
        }
    }
}
