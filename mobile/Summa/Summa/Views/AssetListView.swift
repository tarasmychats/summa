import SwiftUI

struct AssetListView: View {
    var viewModel: DashboardViewModel?
    @State private var assetsToDelete: [Asset] = []
    @State private var showDeleteConfirmation = false
    @State private var transactionAsset: Asset?
    @State private var isDeleting = false

    private var assets: [Asset] {
        viewModel?.assets ?? []
    }

    var body: some View {
        List {
            ForEach(assets) { asset in
                NavigationLink(destination: AssetDetailView(asset: asset, onUpdate: {
                    await viewModel?.refresh(baseCurrency: viewModel?.currencyCode ?? "USD")
                })) {
                    HStack {
                        Image(systemName: asset.assetCategory.iconName)
                            .foregroundStyle(Theme.categoryColor(asset.assetCategory))
                        VStack(alignment: .leading) {
                            Text(asset.name)
                                .font(Theme.headlineFont)
                            Text("\(asset.currentAmount.formatted(.number.precision(.fractionLength(0...8)))) \(asset.displayTicker)")
                                .font(Theme.bodyFont)
                                .foregroundStyle(Theme.textMuted)
                        }
                        Spacer()
                        Text(AssetValueFormatter.formattedValue(
                            for: asset,
                            holdings: viewModel?.holdings ?? [],
                            currencyCode: viewModel?.currencyCode ?? "USD"
                        ))
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.textMuted)
                    }
                }
                .listRowBackground(Theme.bgCard)
                .swipeActions(edge: .leading) {
                    Button {
                        transactionAsset = asset
                    } label: {
                        Label("Transaction", systemImage: "plus.circle")
                    }
                    .tint(Theme.sage)
                }
            }
            .onDelete { indexSet in
                assetsToDelete = indexSet.map { assets[$0] }
                showDeleteConfirmation = true
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bgPrimary)
        .navigationTitle("My Assets")
        .alert(assetsToDelete.count > 1
               ? "Delete \(assetsToDelete.count) Assets?"
               : "Delete \(assetsToDelete.first?.name ?? "Asset")?",
               isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task {
                    for asset in assetsToDelete {
                        do {
                            try await UserAPIClient.shared.delete(path: "/user/assets/\(asset.id)")
                        } catch {
                            print("[Summa] Failed to delete asset \(asset.id): \(error)")
                        }
                    }
                    assetsToDelete = []
                    await viewModel?.refresh(baseCurrency: viewModel?.currencyCode ?? "USD")
                }
            }
            Button("Cancel", role: .cancel) {
                assetsToDelete = []
            }
        } message: {
            if assetsToDelete.count > 1 {
                Text("This will remove \(assetsToDelete.count) assets and all their transaction history.")
            } else if let asset = assetsToDelete.first {
                Text("This will remove \(asset.name) and all its transaction history.")
            }
        }
        .sheet(item: $transactionAsset) { asset in
            AddTransactionView(asset: asset) {
                await viewModel?.refresh(baseCurrency: viewModel?.currencyCode ?? "USD")
            }
        }
    }
}
