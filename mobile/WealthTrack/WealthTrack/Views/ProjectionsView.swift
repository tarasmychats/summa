import SwiftUI
import SwiftData
import Charts

struct ProjectionsView: View {
    @Query private var assets: [Asset]
    @Query private var allSettings: [UserSettings]
    @State private var selectedYears = 10
    @State private var holdings: [PortfolioHolding] = []
    @State private var currencyCode: String = "USD"

    private var displayCurrency: String {
        allSettings.first?.displayCurrency ?? "USD"
    }

    private let yearOptions = [10, 20, 50]

    private var projection: Projection {
        ProjectionEngine.project(holdings: holdings, years: selectedYears)
    }

    private var chartData: [ProjectionPoint] {
        (0...selectedYears).flatMap { year in
            let p = ProjectionEngine.project(holdings: holdings, years: year)
            return [
                ProjectionPoint(year: year, value: p.pessimistic, scenario: "Pessimistic"),
                ProjectionPoint(year: year, value: p.expected, scenario: "Expected"),
                ProjectionPoint(year: year, value: p.optimistic, scenario: "Optimistic"),
            ]
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.sectionSpacing) {
                    Picker("Timeframe", selection: $selectedYears) {
                        ForEach(yearOptions, id: \.self) { years in
                            Text("\(years) Years").tag(years)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    Chart(chartData) { point in
                        LineMark(
                            x: .value("Year", point.year),
                            y: .value("Value", point.value)
                        )
                        .foregroundStyle(by: .value("Scenario", point.scenario))
                    }
                    .chartForegroundStyleScale([
                        "Pessimistic": Theme.coral,
                        "Expected": Theme.sage,
                        "Optimistic": Theme.lavender,
                    ])
                    .frame(height: 300)
                    .themeCard()

                    VStack(spacing: 12) {
                        projectionRow("Pessimistic", value: projection.pessimistic, color: Theme.coral)
                        projectionRow("Expected", value: projection.expected, color: Theme.sage)
                        projectionRow("Optimistic", value: projection.optimistic, color: Theme.lavender)
                    }
                    .themeCard()

                    Text("Based on historical average returns. Past performance does not guarantee future results.")
                        .font(Theme.captionFont)
                        .foregroundStyle(Theme.textMuted)
                        .multilineTextAlignment(.center)
                        .padding()
                }
            }
            .background(Theme.bgPrimary)
            .navigationTitle("Projections")
            .task(id: "\(assets.count)-\(displayCurrency)") {
                await refreshHoldings()
            }
        }
    }

    private func projectionRow(_ label: String, value: Double, color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 12, height: 12)
            Text(label)
                .font(Theme.bodyFont)
            Spacer()
            Text(value, format: .currency(code: currencyCode))
                .font(Theme.headlineFont)
        }
    }

    private func refreshHoldings() async {
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: displayCurrency
            )
            currencyCode = displayCurrency
            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.currentAmount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.currentAmount,
                    pricePerUnit: 0,
                    category: asset.assetCategory
                )
            }
        }
    }
}

struct ProjectionPoint: Identifiable {
    let id = UUID()
    let year: Int
    let value: Double
    let scenario: String
}
