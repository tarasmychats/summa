import SwiftUI
import SwiftData

struct AssetListView: View {
    @Query private var assets: [Asset]
    @Environment(\.modelContext) private var modelContext
    @State private var editingAsset: Asset?

    var body: some View {
        List {
            ForEach(assets) { asset in
                HStack {
                    Image(systemName: asset.assetCategory.iconName)
                        .foregroundStyle(Theme.categoryColor(asset.assetCategory))
                    VStack(alignment: .leading) {
                        Text(asset.name)
                            .font(Theme.headlineFont)
                        Text("\(asset.amount, specifier: "%.4g") \(asset.symbol.uppercased())")
                            .font(Theme.bodyFont)
                            .foregroundStyle(Theme.textMuted)
                    }
                    Spacer()
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    editingAsset = asset
                }
                .listRowBackground(Theme.bgCard)
            }
            .onDelete { indexSet in
                for index in indexSet {
                    modelContext.delete(assets[index])
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bgPrimary)
        .navigationTitle("My Assets")
        .sheet(item: $editingAsset) { asset in
            EditAssetView(asset: asset)
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
    @State private var amountText: String = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                Text(asset.name)
                    .font(Theme.titleFont)
                TextField("Amount", text: $amountText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .font(Theme.largeValue)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Button("Save") {
                    if let value = parseDecimal(amountText), value > 0 {
                        asset.amount = value
                    }
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                Spacer()
            }
            .background(Theme.bgPrimary)
            .navigationTitle("Edit \(asset.name)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                amountText = String(asset.amount)
            }
        }
    }
}
