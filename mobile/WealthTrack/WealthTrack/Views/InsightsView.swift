import SwiftUI
import SwiftData

struct InsightsView: View {
    @Query private var assets: [Asset]
    @Query private var allSettings: [UserSettings]
    @State private var holdings: [PortfolioHolding] = []
    @State private var priceError: String?

    private var displayCurrency: String {
        allSettings.first?.displayCurrency ?? "USD"
    }

    private var insights: [Insight] {
        InsightsEngine.generate(holdings: holdings)
    }

    var body: some View {
        NavigationStack {
            List {
                if let priceError {
                    Text(priceError)
                        .font(Theme.captionFont)
                        .foregroundStyle(Theme.coral)
                        .listRowBackground(Theme.bgCard)
                }
                if insights.isEmpty && !holdings.isEmpty {
                    ContentUnavailableView(
                        "Portfolio Looks Good",
                        systemImage: "checkmark.circle.fill",
                        description: Text("No concerns with your current allocation.")
                    )
                } else if holdings.isEmpty {
                    ContentUnavailableView(
                        "Add Assets First",
                        systemImage: "plus.circle",
                        description: Text("Add assets to your portfolio to see insights.")
                    )
                } else {
                    ForEach(insights) { insight in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: insight.severity == .warning ? "exclamationmark.triangle.fill" : "info.circle.fill")
                                .foregroundStyle(insight.severity == .warning ? Theme.coral : Theme.lavender)
                                .font(.title3)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(insight.title)
                                    .font(Theme.headlineFont)
                                Text(insight.message)
                                    .font(Theme.bodyFont)
                                    .foregroundStyle(Theme.textMuted)
                            }
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Theme.bgCard)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bgPrimary)
            .refreshable {
                await refreshHoldings()
            }
            .navigationTitle("Insights")
            .task(id: "\(assets.count)-\(displayCurrency)-\(assets.map { $0.transactions?.count ?? 0 }.reduce(0, +))") {
                await refreshHoldings()
            }
        }
    }

    private func refreshHoldings() async {
        priceError = nil
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: displayCurrency
            )
            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.currentAmount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
            let missingPrices = assets.filter { priceMap[$0.symbol] == nil }
            if !missingPrices.isEmpty {
                priceError = PriceErrorMessage.partialFailureMessage
            }
        } catch {
            priceError = PriceErrorMessage.userMessage(from: error)
            holdings = []
        }
    }
}
