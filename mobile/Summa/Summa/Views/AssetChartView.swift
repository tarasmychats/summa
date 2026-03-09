import SwiftUI
import Charts

struct AssetPricePoint: Identifiable {
    let id: Int
    let date: Date
    let price: Double
}

struct AssetChartView: View {
    let asset: Asset
    let currency: String

    @State private var selectedRange: ChartTimeRange = .threeMonths
    @State private var dataPoints: [AssetPricePoint] = []
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
        guard let minPrice = dataPoints.map(\.price).min(),
              let maxPrice = dataPoints.map(\.price).max(),
              maxPrice > minPrice else {
            return 0...1
        }
        let padding = (maxPrice - minPrice) * 0.1
        return (minPrice - padding)...(maxPrice + padding)
    }

    private var yTickValues: [Double] {
        let domain = yDomain
        let tickCount = 4
        let step = (domain.upperBound - domain.lowerBound) / Double(tickCount - 1)
        return (0..<tickCount).map { domain.lowerBound + step * Double($0) }
    }

    private var selectedPoint: AssetPricePoint? {
        guard let idx = selectedIndex, dataPoints.indices.contains(idx) else { return nil }
        return dataPoints[idx]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Price History")
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
                Text("No price history available yet")
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                chart
            }
        }
        .themeCard()
        .task(id: "\(selectedRange.rawValue)-\(asset.symbol)-\(currency)") {
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
                    y: .value("Price", point.price)
                )
                .foregroundStyle(Theme.sage)
                .interpolationMethod(.catmullRom)

                AreaMark(
                    x: .value("Date", point.date),
                    y: .value("Price", point.price)
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
                                    guard let plotFrame = proxy.plotFrame else { return }
                                    let xPosition = value.location.x - geometry[plotFrame].origin.x
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
        .accessibilityLabel("Price history chart for \(asset.name)")
    }

    private func selectionOverlay(for point: AssetPricePoint) -> some View {
        VStack(spacing: 2) {
            Text(point.price, format: .currency(code: currency).precision(.fractionLength(0...2)))
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
        isLoading = true
        errorMessage = nil

        let fromDate = selectedRange.startDate
        let toDate = Date()

        let assetParams = [(id: asset.symbol, category: asset.category)]

        do {
            let history = try await PriceAPIClient.shared.fetchHistory(
                assets: assetParams,
                from: fromDate,
                to: toDate,
                currency: currency.lowercased()
            )

            let compositeKey = "\(asset.symbol):\(asset.category)"
            if let points = history[compositeKey] {
                dataPoints = points.enumerated().compactMap { index, point in
                    guard let date = Self.dateFormatter.date(from: point.date) else { return nil }
                    return AssetPricePoint(id: index, date: date, price: point.price)
                }.sorted { $0.date < $1.date }
            } else {
                dataPoints = []
            }
        } catch {
            errorMessage = "Could not load price history"
            dataPoints = []
        }

        isLoading = false
    }
}
