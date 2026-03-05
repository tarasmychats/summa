import SwiftUI
import SwiftData
import Charts

struct DashboardView: View {
    @Query private var assets: [Asset]
    @Query private var allSettings: [UserSettings]
    @State private var viewModel = DashboardViewModel()
    @State private var showingAddAsset = false
    @State private var suggestedAsset: AssetDefinition?
    @State private var cardsAppeared = false

    static let suggestedAssets: [AssetDefinition] = [
        AssetDefinition(id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: .crypto),
        AssetDefinition(id: "VOO", name: "S&P 500 ETF", symbol: "VOO", category: .stock),
        AssetDefinition(id: "USD", name: "US Dollar", symbol: "USD", category: .fiat),
    ]

    private var displayCurrency: String {
        allSettings.first?.displayCurrency ?? "USD"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if assets.isEmpty {
                    emptyState
                } else if viewModel.isLoading && viewModel.holdings.isEmpty {
                    loadingSkeleton
                } else {
                    VStack(spacing: Theme.sectionSpacing) {
                        if let error = viewModel.priceError {
                            Text(error)
                                .font(Theme.captionFont)
                                .foregroundStyle(Theme.coral)
                                .frame(maxWidth: .infinity)
                                .padding(12)
                                .background(Theme.coral.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        PortfolioChartView(assets: assets, currency: displayCurrency)
                            .cardAppearance(index: 0, appeared: cardsAppeared)
                        totalValueCard
                            .cardAppearance(index: 1, appeared: cardsAppeared)
                        lastUpdatedLabel
                        holdingsSection
                            .cardAppearance(index: 2, appeared: cardsAppeared)
                        breakdownChart
                            .cardAppearance(index: 3, appeared: cardsAppeared)
                        riskScoreCard
                            .cardAppearance(index: 4, appeared: cardsAppeared)
                        if let preview = viewModel.projectionPreview {
                            projectionPreviewCard(preview)
                                .cardAppearance(index: 5, appeared: cardsAppeared)
                        }
                    }
                    .padding()
                    .onAppear { cardsAppeared = true }
                }
            }
            .background(Theme.bgPrimary)
            .refreshable {
                await viewModel.refresh(assets: assets, baseCurrency: displayCurrency)
            }
            .navigationTitle("WealthTrack")
            .toolbar {
                ToolbarItem(placement: .navigation) {
                    NavigationLink(destination: AssetListView(viewModel: viewModel)) {
                        Image(systemName: "list.bullet")
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: 12) {
                        NavigationLink(destination: SettingsView()) {
                            Image(systemName: "gearshape")
                        }
                        Button {
                            showingAddAsset = true
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .sheet(isPresented: $showingAddAsset) {
                AddAssetView()
            }
            .sheet(item: $suggestedAsset) { asset in
                AddAssetView(initialAsset: asset)
            }
            .task(id: "\(assets.map(\.id.uuidString).sorted().joined(separator: ","))-\(displayCurrency)-\(assets.map { $0.transactions?.count ?? 0 }.description)") {
                await viewModel.refresh(assets: assets, baseCurrency: displayCurrency)
            }
        }
    }

    private var loadingSkeleton: some View {
        VStack(spacing: Theme.sectionSpacing) {
            // Chart placeholder
            RoundedRectangle(cornerRadius: 12)
                .fill(Theme.bgCard)
                .frame(height: 200)
                .themeCard()

            // Total value placeholder
            VStack(spacing: 4) {
                Text("Total Portfolio Value")
                    .font(Theme.bodyFont)
                    .foregroundStyle(Theme.textMuted)
                Text("$00,000")
                    .font(Theme.largeValue)
            }
            .frame(maxWidth: .infinity)
            .themeCard()

            // Allocation placeholder
            VStack(alignment: .leading) {
                Text("Allocation")
                    .font(Theme.headlineFont)
                RoundedRectangle(cornerRadius: 12)
                    .fill(Theme.bgCard)
                    .frame(height: 200)
            }
            .themeCard()

            // Risk score placeholder
            HStack {
                VStack(alignment: .leading) {
                    Text("Risk Score")
                        .font(Theme.headlineFont)
                    Text("Calculating...")
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer()
                Text("0")
                    .font(Theme.largeValue)
                Text("/ 10")
                    .font(Theme.bodyFont)
                    .foregroundStyle(Theme.textMuted)
            }
            .themeCard()
        }
        .padding()
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.pie.fill")
                .font(.system(size: 60))
                .foregroundStyle(Theme.sage.opacity(0.5))
            Text("What do you own?")
                .font(Theme.titleFont)
            Text("Add your first asset to start tracking your wealth.")
                .foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center)
            Button("Add Asset") {
                showingAddAsset = true
            }
            .buttonStyle(.borderedProminent)

            VStack(spacing: 8) {
                Text("Quick add")
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
                HStack(spacing: 10) {
                    ForEach(Self.suggestedAssets) { asset in
                        Button {
                            suggestedAsset = asset
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: asset.category.iconName)
                                    .font(.system(size: 12))
                                Text(asset.name)
                                    .font(Theme.captionFont)
                            }
                            .foregroundStyle(Theme.categoryColor(asset.category))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Theme.categoryTint(asset.category))
                            .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .containerRelativeFrame(.vertical) { height, _ in height * 0.7 }
    }

    private var totalValueCard: some View {
        VStack(spacing: 4) {
            Text("Total Portfolio Value")
                .font(Theme.bodyFont)
                .foregroundStyle(Theme.textMuted)
            Text(viewModel.totalValue, format: .currency(code: viewModel.currencyCode))
                .font(Theme.largeValue)
                .contentTransition(.numericText())
            if let change = viewModel.valueChange {
                HStack(spacing: 4) {
                    Image(systemName: change.isPositive ? "arrow.up.right" : "arrow.down.right")
                        .font(Theme.captionFont)
                    Text(change.amount, format: .currency(code: viewModel.currencyCode).sign(strategy: .always()))
                    Text("(\(change.percent, specifier: "%+.1f")%)")
                }
                .font(Theme.captionFont.weight(.medium))
                .foregroundStyle(change.isPositive ? Theme.sage : Theme.coral)
                .contentTransition(.numericText())
            }
        }
        .frame(maxWidth: .infinity)
        .themeCard()
    }

    @ViewBuilder
    private var lastUpdatedLabel: some View {
        if let lastUpdated = viewModel.lastUpdated {
            TimelineView(.periodic(from: .now, by: 30)) { _ in
                Text("Updated \(lastUpdated, format: .relative(presentation: .named))")
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }

    private var holdingsSection: some View {
        let sortedHoldings = viewModel.holdings
            .sorted { $0.totalValue > $1.totalValue }
        let topHoldings = Array(sortedHoldings.prefix(5))
        let hasMore = viewModel.holdings.count > 5

        return VStack(alignment: .leading, spacing: 8) {
            Text("Holdings")
                .font(Theme.headlineFont)

            ForEach(topHoldings) { holding in
                if let asset = assets.first(where: { $0.id == holding.id }) {
                    NavigationLink(destination: AssetDetailView(asset: asset)) {
                        HStack(spacing: 12) {
                            Image(systemName: holding.category.iconName)
                                .foregroundStyle(Theme.categoryColor(holding.category))
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(holding.name)
                                    .font(Theme.bodyFont)
                                Text("\(holding.amount.formatted(.number.precision(.fractionLength(0...4)))) \(asset.displayTicker)")
                                    .font(Theme.captionFont)
                                    .foregroundStyle(Theme.textMuted)
                            }
                            Spacer()
                            Text(holding.totalValue, format: .currency(code: viewModel.currencyCode).precision(.fractionLength(0...2)))
                                .font(Theme.bodyFont)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }

            if hasMore {
                NavigationLink(destination: AssetListView(viewModel: viewModel)) {
                    Text("View All")
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.sage)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 4)
                }
            }
        }
        .themeCard()
    }

    private var breakdownChart: some View {
        let sortedCategories = viewModel.breakdown.keys.sorted(by: { $0.rawValue < $1.rawValue })
        let percentages = PortfolioCalculator.categoryPercentages(breakdown: viewModel.breakdown)

        return VStack(alignment: .leading) {
            Text("Allocation")
                .font(Theme.headlineFont)
            Chart {
                ForEach(Array(sortedCategories), id: \.self) { category in
                    SectorMark(
                        angle: .value(category.displayName, viewModel.breakdown[category] ?? 0),
                        angularInset: 1.5
                    )
                    .foregroundStyle(Theme.categoryColor(category))
                }
            }
            .frame(height: 200)

            HStack(spacing: 16) {
                ForEach(Array(sortedCategories), id: \.self) { category in
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Theme.categoryColor(category))
                            .frame(width: 10, height: 10)
                        Text("\(category.displayName) \(percentages[category] ?? 0)%")
                            .font(Theme.captionFont)
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
            .padding(.top, 4)
        }
        .themeCard()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel({
            let items = sortedCategories.map { "\($0.displayName) \(percentages[$0] ?? 0)%" }
            return "Portfolio allocation: \(items.joined(separator: ", "))"
        }())
    }

    private var riskScoreCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading) {
                    Text("Risk Score")
                        .font(Theme.headlineFont)
                    Text(viewModel.riskScore.label)
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer()
                Text("\(viewModel.riskScore.value)")
                    .font(Theme.largeValue)
                    .foregroundStyle(Theme.riskColor(viewModel.riskScore.value))
                Text("/ 10")
                    .font(Theme.bodyFont)
                    .foregroundStyle(Theme.textMuted)
            }
            Gauge(value: Double(viewModel.riskScore.value), in: 0...10) {
                EmptyView()
            }
            .gaugeStyle(.linearCapacity)
            .tint(Gradient(colors: [Theme.sage, Theme.amber, Theme.coral]))
        }
        .themeCard()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Risk score: \(viewModel.riskScore.value) out of 10, \(viewModel.riskScore.label)")
    }

    private func projectionPreviewCard(_ projection: Projection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("10-Year Projection")
                .font(Theme.headlineFont)
            HStack {
                projectionColumn(label: "Pessimistic", value: projection.pessimistic, color: Theme.coral)
                projectionColumn(label: "Expected", value: projection.expected, color: Theme.sage)
                projectionColumn(label: "Optimistic", value: projection.optimistic, color: Theme.lavender)
            }
        }
        .themeCard()
    }

    private func projectionColumn(label: String, value: Double, color: Color) -> some View {
        VStack {
            Text(label)
                .font(Theme.captionFont)
                .foregroundStyle(Theme.textMuted)
            Text(value, format: .currency(code: viewModel.currencyCode))
                .font(Theme.bodyFont.bold())
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
    }
}
