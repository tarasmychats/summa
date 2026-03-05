import Foundation
import SwiftData
import Observation

@Observable
class DashboardViewModel {
    var holdings: [PortfolioHolding] = []
    var totalValue: Double = 0
    var previousValue: Double?
    var valueChange: ValueChange?
    var breakdown: [AssetCategory: Double] = [:]
    var riskScore: RiskScore = RiskScore(value: 0, label: "No Assets")
    var projectionPreview: Projection?
    var isLoading = false
    var priceError: String?
    var currencyCode: String = "USD"
    var lastUpdated: Date?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    func refresh(assets: [Asset], baseCurrency: String = "USD") async {
        currencyCode = baseCurrency
        guard !assets.isEmpty else {
            holdings = []
            totalValue = 0
            previousValue = nil
            valueChange = nil
            breakdown = [:]
            riskScore = RiskScore(value: 0, label: "No Assets")
            projectionPreview = nil
            lastUpdated = nil
            isLoading = false
            return
        }
        isLoading = true
        priceError = nil

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
                print("[WealthTrack] Missing prices for: \(symbols)")
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
            print("[WealthTrack] Price fetch failed: \(error)")
            priceError = PriceErrorMessage.userMessage(from: error)
            // Use zero prices on error — user still sees their assets
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

    /// UTC calendar used for date comparisons to match the UTC date strings from the API
    private static let utcCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }()

    /// Replay transactions up to a given date to determine asset amount at that point in time
    private func amountAtDate(date: Date, transactions: [Transaction], fallbackAmount: Double) -> Double {
        guard !transactions.isEmpty else { return fallbackAmount }

        let relevant = transactions.filter { Self.utcCalendar.startOfDay(for: $0.date) <= Self.utcCalendar.startOfDay(for: date) }
        guard !relevant.isEmpty else { return 0.0 }

        var balance = 0.0
        for txn in relevant {
            switch txn.type {
            case .delta:
                balance += txn.amount
            case .snapshot:
                balance = txn.amount
            }
        }
        return balance
    }

    /// Fetch the most recent prior day's portfolio value from history API
    private func fetchPreviousValue(assets: [Asset], currency: String) async -> Double? {
        let calendar = Calendar.current
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
                let txns = (asset.transactions ?? []).sorted { $0.date < $1.date }
                return (asset, txns)
            }

            // Build per-asset price maps
            let assetPriceMaps: [(asset: Asset, sortedTxns: [Transaction], priceMap: [String: Double])] = assetTransactions.compactMap { (asset, sortedTxns) in
                let compositeKey = "\(asset.symbol):\(asset.category)"
                guard let assetHistory = history[compositeKey] else { return nil }
                let priceMap = Dictionary(assetHistory.map { ($0.date, $0.price) }, uniquingKeysWith: { _, last in last })
                return (asset, sortedTxns, priceMap)
            }

            // If any asset has no history at all, we can't compute previous value
            guard assetPriceMaps.count == assets.count else { return nil }

            // Find the most recent date where ALL assets have a price
            for candidateDate in sortedDates {
                guard let candidateDateParsed = Self.dateFormatter.date(from: candidateDate) else { continue }

                var dayTotal = 0.0
                var allHavePrice = true
                for (asset, sortedTxns, priceMap) in assetPriceMaps {
                    guard let price = priceMap[candidateDate] else {
                        allHavePrice = false
                        break
                    }
                    let amount = amountAtDate(date: candidateDateParsed, transactions: sortedTxns, fallbackAmount: asset.amount)
                    dayTotal += price * amount
                }

                if allHavePrice {
                    return dayTotal > 0 ? dayTotal : nil
                }
            }

            // No date found where all assets have prices
            return nil
        } catch {
            print("[WealthTrack] History fetch for change indicator failed: \(error)")
            return nil
        }
    }
}
