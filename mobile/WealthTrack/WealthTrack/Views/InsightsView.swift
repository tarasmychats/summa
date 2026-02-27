import SwiftUI
import SwiftData

struct InsightsView: View {
    @Query private var assets: [Asset]
    @State private var holdings: [PortfolioHolding] = []

    private var insights: [Insight] {
        InsightsEngine.generate(holdings: holdings)
    }

    var body: some View {
        NavigationStack {
            List {
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
                                .foregroundStyle(insight.severity == .warning ? .orange : .blue)
                                .font(.title3)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(insight.title)
                                    .font(.headline)
                                Text(insight.message)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Insights")
            .task(id: assets.count) {
                await refreshHoldings()
            }
        }
    }

    private func refreshHoldings() async {
        do {
            let prices = try await PriceAPIClient.shared.fetchPrices(
                assets: assets,
                baseCurrency: "USD"
            )
            let priceMap = Dictionary(uniqueKeysWithValues: prices.map { ($0.id, $0.price) })
            holdings = assets.map { asset in
                PortfolioHolding(
                    name: asset.name,
                    amount: asset.amount,
                    pricePerUnit: priceMap[asset.symbol] ?? 0,
                    category: asset.assetCategory
                )
            }
        } catch {
            holdings = []
        }
    }
}
