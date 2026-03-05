import SwiftUI
import SwiftData
import Charts

struct DashboardView: View {
    @Query private var assets: [Asset]
    @Query private var allSettings: [UserSettings]
    @State private var viewModel = DashboardViewModel()
    @State private var showingAddAsset = false
    @State private var cardsAppeared = false

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
                        breakdownChart
                            .cardAppearance(index: 2, appeared: cardsAppeared)
                        riskScoreCard
                            .cardAppearance(index: 3, appeared: cardsAppeared)
                        if let preview = viewModel.projectionPreview {
                            projectionPreviewCard(preview)
                                .cardAppearance(index: 4, appeared: cardsAppeared)
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

    private var breakdownChart: some View {
        VStack(alignment: .leading) {
            Text("Allocation")
                .font(Theme.headlineFont)
            Chart {
                ForEach(Array(viewModel.breakdown.keys.sorted(by: { $0.rawValue < $1.rawValue })), id: \.self) { category in
                    SectorMark(
                        angle: .value(category.displayName, viewModel.breakdown[category] ?? 0),
                        angularInset: 1.5
                    )
                    .foregroundStyle(Theme.categoryColor(category))
                }
            }
            .frame(height: 200)

            let percentages = PortfolioCalculator.categoryPercentages(breakdown: viewModel.breakdown)
            HStack(spacing: 16) {
                ForEach(Array(viewModel.breakdown.keys.sorted(by: { $0.rawValue < $1.rawValue })), id: \.self) { category in
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
    }

    private var riskScoreCard: some View {
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
        .themeCard()
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
