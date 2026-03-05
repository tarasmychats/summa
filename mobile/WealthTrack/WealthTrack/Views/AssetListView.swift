import SwiftUI
import SwiftData

struct AssetListView: View {
    @Query private var assets: [Asset]
    @Environment(\.modelContext) private var modelContext
    var viewModel: DashboardViewModel?
    @State private var assetToDelete: Asset?
    @State private var showDeleteConfirmation = false

    var body: some View {
        List {
            ForEach(assets) { asset in
                NavigationLink(destination: AssetDetailView(asset: asset)) {
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
            }
            .onDelete { indexSet in
                if let index = indexSet.first {
                    assetToDelete = assets[index]
                    showDeleteConfirmation = true
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bgPrimary)
        .navigationTitle("My Assets")
        .alert("Delete \(assetToDelete?.name ?? "Asset")?",
               isPresented: $showDeleteConfirmation,
               presenting: assetToDelete) { asset in
            Button("Delete", role: .destructive) {
                modelContext.delete(asset)
                assetToDelete = nil
            }
            Button("Cancel", role: .cancel) {
                assetToDelete = nil
            }
        } message: { asset in
            Text("This will remove \(asset.name) and all its transaction history.")
        }
    }
}

private func parseDecimal(_ text: String) -> Double? {
    if let value = Double(text) { return value }
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = .current
    return formatter.number(from: text)?.doubleValue
}

struct EditAssetView: View {
    @Bindable var asset: Asset
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var amountText: String = ""

    private var isValid: Bool {
        guard let value = parseDecimal(amountText) else { return false }
        return value > 0
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(spacing: 20) {
                    // Asset identity
                    VStack(spacing: 8) {
                        Image(systemName: asset.assetCategory.iconName)
                            .font(.system(size: 36))
                            .foregroundStyle(Theme.categoryColor(asset.assetCategory))

                        Text(asset.name)
                            .font(Theme.titleFont)

                        Text(asset.displayTicker)
                            .font(Theme.captionFont)
                            .foregroundStyle(Theme.textMuted)
                    }
                    .padding(.top, 32)

                    // Amount input
                    VStack(spacing: 8) {
                        TextField("0", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(Theme.largeValue)
                            .multilineTextAlignment(.center)
                            .padding(.vertical, 12)
                            .padding(.horizontal, 24)
                            .background(Theme.bgCard)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .padding(.horizontal, 40)

                        Text("Amount held")
                            .font(Theme.captionFont)
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                .padding(.bottom, 32)

                // Save button
                Button {
                    if let value = parseDecimal(amountText), value > 0 {
                        let hasTransactions = !(asset.transactions ?? []).isEmpty
                        if hasTransactions {
                            // Create a snapshot transaction so the replay reflects the new total
                            let txn = Transaction(date: Date(), type: .snapshot, amount: value, note: "Manual edit")
                            txn.asset = asset
                            modelContext.insert(txn)
                        }
                        asset.amount = value
                    }
                    dismiss()
                } label: {
                    Text("Save")
                        .font(Theme.headlineFont)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!isValid)
                .padding(.horizontal, 40)

                Spacer()
            }
            .background(Theme.bgPrimary)
            .navigationTitle("Edit \(asset.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                // Use currentAmount (transaction-replayed value) so the edit form
                // reflects the actual balance, not the potentially stale stored amount.
                let current = asset.currentAmount
                amountText = current.truncatingRemainder(dividingBy: 1) == 0
                    ? String(format: "%.0f", current)
                    : String(current)
            }
        }
    }
}
