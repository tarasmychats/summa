import SwiftUI
import SwiftData
import Charts

enum ChartTimeRange: String, CaseIterable, Identifiable {
    case oneMonth = "1M"
    case threeMonths = "3M"
    case sixMonths = "6M"
    case oneYear = "1Y"
    case fiveYears = "5Y"

    var id: String { rawValue }

    var startDate: Date {
        let calendar = Calendar.current
        let now = Date()
        switch self {
        case .oneMonth: return calendar.date(byAdding: .month, value: -1, to: now)!
        case .threeMonths: return calendar.date(byAdding: .month, value: -3, to: now)!
        case .sixMonths: return calendar.date(byAdding: .month, value: -6, to: now)!
        case .oneYear: return calendar.date(byAdding: .year, value: -1, to: now)!
        case .fiveYears: return calendar.date(byAdding: .year, value: -5, to: now)!
        }
    }
}

struct PortfolioDataPoint: Identifiable {
    let id = UUID()
    let date: Date
    let value: Double
}

struct PortfolioChartView: View {
    let assets: [Asset]
    let currency: String

    @State private var selectedRange: ChartTimeRange = .threeMonths
    @State private var dataPoints: [PortfolioDataPoint] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Portfolio Value")
                .font(Theme.headlineFont)

            timeRangeSelector

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else if let error = errorMessage {
                Text(error)
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else if dataPoints.isEmpty {
                Text("No history data available yet")
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                chart
            }
        }
        .themeCard()
        .task(id: "\(selectedRange.rawValue)-\(assets.map(\.id.uuidString).joined())-\(currency)-\(assets.map { $0.transactions?.count ?? 0 }.description)") {
            await loadHistory()
        }
    }

    private var timeRangeSelector: some View {
        HStack(spacing: 0) {
            ForEach(ChartTimeRange.allCases) { range in
                Button {
                    selectedRange = range
                } label: {
                    Text(range.rawValue)
                        .font(Theme.captionFont.weight(.medium))
                        .foregroundStyle(selectedRange == range ? .white : Theme.textMuted)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            selectedRange == range
                                ? Capsule().fill(Theme.sage)
                                : Capsule().fill(Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var chart: some View {
        Chart(dataPoints) { point in
            LineMark(
                x: .value("Date", point.date),
                y: .value("Value", point.value)
            )
            .foregroundStyle(Theme.sage)
            .interpolationMethod(.catmullRom)

            AreaMark(
                x: .value("Date", point.date),
                y: .value("Value", point.value)
            )
            .foregroundStyle(
                LinearGradient(
                    colors: [Theme.sage.opacity(0.3), Theme.sage.opacity(0.0)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .interpolationMethod(.catmullRom)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisValueLabel {
                    if let val = value.as(Double.self) {
                        Text(val, format: .currency(code: currency).precision(.fractionLength(0)))
                            .font(Theme.captionFont)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        Text(date, format: .dateTime.month(.abbreviated))
                            .font(Theme.captionFont)
                    }
                }
            }
        }
        .frame(height: 200)
    }

    private func loadHistory() async {
        guard !assets.isEmpty else {
            dataPoints = []
            return
        }

        isLoading = true
        errorMessage = nil

        let fromDate = selectedRange.startDate
        let toDate = Date()

        let assetParams = assets.map { (id: $0.symbol, category: $0.category) }

        do {
            let history = try await PriceAPIClient.shared.fetchHistory(
                assets: assetParams,
                from: fromDate,
                to: toDate,
                currency: currency.lowercased()
            )

            dataPoints = computePortfolioSeries(history: history, assets: assets, from: fromDate, to: toDate)
        } catch {
            errorMessage = "Could not load chart data"
            dataPoints = []
        }

        isLoading = false
    }

    /// Compute daily portfolio total: for each day, total = sum(assetPrice[day] * amountAtDay[asset])
    private func computePortfolioSeries(
        history: [String: [HistoryDataPoint]],
        assets: [Asset],
        from: Date,
        to: Date
    ) -> [PortfolioDataPoint] {
        // Build price lookup: compositeKey (assetId:category) -> date string -> price
        var priceLookup: [String: [String: Double]] = [:]
        for (key, points) in history {
            var dateMap: [String: Double] = [:]
            for point in points {
                dateMap[point.date] = point.price
            }
            priceLookup[key] = dateMap
        }

        // Collect all unique dates across all assets, sorted
        var allDatesSet = Set<String>()
        for (_, points) in history {
            for point in points {
                allDatesSet.insert(point.date)
            }
        }
        let sortedDateStrings = allDatesSet.sorted()

        guard !sortedDateStrings.isEmpty else { return [] }

        // Pre-compute sorted transactions for each asset
        let assetTransactions: [(asset: Asset, sortedTxns: [Transaction])] = assets.map { asset in
            let txns = (asset.transactions ?? []).sorted { $0.date < $1.date }
            return (asset, txns)
        }

        var results: [PortfolioDataPoint] = []

        for dateString in sortedDateStrings {
            guard let date = Self.dateFormatter.date(from: dateString) else { continue }

            var dayTotal = 0.0

            for (asset, sortedTxns) in assetTransactions {
                let compositeKey = "\(asset.symbol):\(asset.category)"
                guard let price = priceLookup[compositeKey]?[dateString] else { continue }

                let amount = amountAtDate(date: date, transactions: sortedTxns, fallbackAmount: asset.amount)
                dayTotal += price * amount
            }

            results.append(PortfolioDataPoint(date: date, value: dayTotal))
        }

        return results
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

        // Only consider transactions on or before this date
        // Use UTC calendar to match the UTC date strings from the price history API
        let relevant = transactions.filter { Self.utcCalendar.startOfDay(for: $0.date) <= Self.utcCalendar.startOfDay(for: date) }

        // Transactions exist but none before this date — user didn't hold this asset yet
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
}
