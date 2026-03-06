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

    var accessibilityName: String {
        switch self {
        case .oneMonth: return "1 month"
        case .threeMonths: return "3 months"
        case .sixMonths: return "6 months"
        case .oneYear: return "1 year"
        case .fiveYears: return "5 years"
        }
    }

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

    var xAxisStride: Calendar.Component {
        switch self {
        case .oneMonth: return .weekOfYear
        case .threeMonths, .sixMonths: return .month
        case .oneYear: return .month
        case .fiveYears: return .year
        }
    }

    var xAxisStrideCount: Int {
        switch self {
        case .oneMonth: return 1
        case .threeMonths: return 1
        case .sixMonths: return 2
        case .oneYear: return 3
        case .fiveYears: return 1
        }
    }

    var xAxisDateFormat: Date.FormatStyle {
        switch self {
        case .oneMonth:
            return .dateTime.day().month(.abbreviated)
        case .threeMonths, .sixMonths, .oneYear:
            return .dateTime.month(.abbreviated)
        case .fiveYears:
            return .dateTime.year()
        }
    }
}

struct PortfolioDataPoint: Identifiable {
    let id: Int
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
    @State private var selectedIndex: Int?

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    private var yDomain: ClosedRange<Double> {
        guard let minVal = dataPoints.map(\.value).min(),
              let maxVal = dataPoints.map(\.value).max(),
              maxVal > minVal else {
            return 0...1
        }
        let padding = (maxVal - minVal) * 0.1
        return (minVal - padding)...(maxVal + padding)
    }

    private var yTickValues: [Double] {
        let domain = yDomain
        let tickCount = 4
        let step = (domain.upperBound - domain.lowerBound) / Double(tickCount - 1)
        return (0..<tickCount).map { domain.lowerBound + step * Double($0) }
    }

    private var selectedPoint: PortfolioDataPoint? {
        guard let idx = selectedIndex, dataPoints.indices.contains(idx) else { return nil }
        return dataPoints[idx]
    }

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
                .accessibilityLabel("\(range.accessibilityName)\(selectedRange == range ? ", selected" : "")")
            }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: selectedRange)
    }

    private var chart: some View {
        ZStack(alignment: .topLeading) {
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
            .chartYScale(domain: yDomain)
            .chartPlotStyle { plot in
                plot.padding(.trailing, 20).clipped()
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: yTickValues) { value in
                    AxisValueLabel {
                        if let val = value.as(Double.self) {
                            Text(AssetValueFormatter.compactPrice(val, code: currency))
                                .font(Theme.captionFont)
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: selectedRange.xAxisStride, count: selectedRange.xAxisStrideCount)) { value in
                    AxisValueLabel {
                        if let date = value.as(Date.self) {
                            Text(date, format: selectedRange.xAxisDateFormat)
                                .font(Theme.captionFont)
                        }
                    }
                }
            }
            .chartOverlay { proxy in
                GeometryReader { geometry in
                    Rectangle()
                        .fill(Color.clear)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    let xPosition = value.location.x - geometry[proxy.plotAreaFrame].origin.x
                                    guard let date: Date = proxy.value(atX: xPosition) else { return }
                                    if let index = ChartSelectionHelper.nearestIndex(in: dataPoints, to: date, dateOf: \.date) {
                                        if selectedIndex != index {
                                            selectedIndex = index
                                        }
                                    }
                                }
                                .onEnded { _ in
                                    selectedIndex = nil
                                }
                        )
                }
            }

            if let selected = selectedPoint {
                selectionOverlay(for: selected)
            }
        }
        .frame(height: 200)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Portfolio value chart showing \(selectedRange.accessibilityName) history")
    }

    private func selectionOverlay(for point: PortfolioDataPoint) -> some View {
        VStack(spacing: 2) {
            Text(point.value, format: .currency(code: currency).precision(.fractionLength(0)))
                .font(Theme.captionFont.weight(.semibold))
                .foregroundStyle(Theme.textPrimary)
            Text(point.date, format: .dateTime.month(.abbreviated).day())
                .font(Theme.captionFont)
                .foregroundStyle(Theme.textMuted)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Theme.bgCard, in: RoundedRectangle(cornerRadius: 6))
        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
    }

    private func loadHistory() async {
        guard !assets.isEmpty else {
            dataPoints = []
            return
        }

        // For fiat-only portfolios matching display currency, generate data locally
        let holdings = assets.map {
            PortfolioHolding(name: $0.name, symbol: $0.symbol, amount: $0.currentAmount, pricePerUnit: 1, category: $0.assetCategory)
        }
        if PortfolioCalculator.allFiatMatchingCurrency(holdings: holdings, currency: currency) {
            dataPoints = generateFiatDataPoints(assets: assets)
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

        for (index, dateString) in sortedDateStrings.enumerated() {
            guard let date = Self.dateFormatter.date(from: dateString) else { continue }

            var dayTotal = 0.0

            for (asset, sortedTxns) in assetTransactions {
                let compositeKey = "\(asset.symbol):\(asset.category)"
                guard let price = priceLookup[compositeKey]?[dateString] else { continue }

                let amount = PortfolioCalculator.amountAtDate(date: date, transactions: sortedTxns, fallbackAmount: asset.amount)
                dayTotal += price * amount
            }

            results.append(PortfolioDataPoint(id: index, date: date, value: dayTotal))
        }

        return results
    }

    /// Generate daily data points for fiat-only portfolios (price = 1.0, value = amount).
    private func generateFiatDataPoints(assets: [Asset]) -> [PortfolioDataPoint] {
        let calendar = PortfolioCalculator.utcCalendar
        let fromDate = calendar.startOfDay(for: selectedRange.startDate)
        let toDate = calendar.startOfDay(for: Date())

        let assetTransactions: [(asset: Asset, sortedTxns: [Transaction])] = assets.map { asset in
            let txns = (asset.transactions ?? []).sorted { $0.date < $1.date }
            return (asset, txns)
        }

        var results: [PortfolioDataPoint] = []
        var current = fromDate
        var index = 0

        while current <= toDate {
            var dayTotal = 0.0
            for (asset, sortedTxns) in assetTransactions {
                dayTotal += PortfolioCalculator.amountAtDate(
                    date: current,
                    transactions: sortedTxns,
                    fallbackAmount: asset.amount
                )
            }
            results.append(PortfolioDataPoint(id: index, date: current, value: dayTotal))
            index += 1
            current = calendar.date(byAdding: .day, value: 1, to: current)!
        }

        return results
    }

}
