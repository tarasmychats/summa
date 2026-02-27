import SwiftUI
import SwiftData
import Charts

struct DashboardView: View {
    @Query private var assets: [Asset]
    @State private var viewModel = DashboardViewModel()
    @State private var showingAddAsset = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if assets.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 20) {
                        totalValueCard
                        breakdownChart
                        riskScoreCard
                        if let preview = viewModel.projectionPreview {
                            projectionPreviewCard(preview)
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("WealthTrack")
            .toolbar {
                ToolbarItem(placement: .navigation) {
                    NavigationLink(destination: AssetListView()) {
                        Image(systemName: "list.bullet")
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingAddAsset = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddAsset) {
                AddAssetView()
            }
            .task(id: assets.count) {
                await viewModel.refresh(assets: assets)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "chart.pie.fill")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("What do you own?")
                .font(.title2.bold())
            Text("Add your first asset to start tracking your wealth.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Add Asset") {
                showingAddAsset = true
            }
            .buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
    }

    private var totalValueCard: some View {
        VStack(spacing: 4) {
            Text("Total Portfolio Value")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(viewModel.totalValue, format: .currency(code: "USD"))
                .font(.system(size: 36, weight: .bold, design: .rounded))
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var breakdownChart: some View {
        VStack(alignment: .leading) {
            Text("Allocation")
                .font(.headline)
            Chart {
                ForEach(Array(viewModel.breakdown.keys.sorted(by: { $0.rawValue < $1.rawValue })), id: \.self) { category in
                    SectorMark(
                        angle: .value(category.displayName, viewModel.breakdown[category] ?? 0),
                        angularInset: 1.5
                    )
                    .foregroundStyle(by: .value("Category", category.displayName))
                }
            }
            .frame(height: 200)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var riskScoreCard: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("Risk Score")
                    .font(.headline)
                Text(viewModel.riskScore.label)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(viewModel.riskScore.value)")
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .foregroundStyle(riskColor)
            Text("/ 10")
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var riskColor: Color {
        switch viewModel.riskScore.value {
        case 1...3: return .green
        case 4...6: return .yellow
        default: return .red
        }
    }

    private func projectionPreviewCard(_ projection: Projection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("10-Year Projection")
                .font(.headline)
            HStack {
                projectionColumn(label: "Pessimistic", value: projection.pessimistic, color: .red)
                projectionColumn(label: "Expected", value: projection.expected, color: .blue)
                projectionColumn(label: "Optimistic", value: projection.optimistic, color: .green)
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func projectionColumn(label: String, value: Double, color: Color) -> some View {
        VStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value, format: .currency(code: "USD"))
                .font(.subheadline.bold())
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
    }
}
