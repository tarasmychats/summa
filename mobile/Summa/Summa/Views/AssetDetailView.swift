import SwiftUI
import SwiftData

struct AssetDetailView: View {
    let asset: Asset
    @Environment(\.modelContext) private var modelContext
    @Query private var allSettings: [UserSettings]
    @State private var showingEditSheet = false
    @State private var showingAddTransaction = false

    private var displayCurrency: String {
        allSettings.first?.displayCurrency ?? "USD"
    }

    var body: some View {
        List {
            // Price chart section
            Section {
                AssetChartView(asset: asset, currency: displayCurrency)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }

            // Header section: asset info + current amount
            Section {
                VStack(spacing: 12) {
                    Image(systemName: asset.assetCategory.iconName)
                        .font(.system(size: 36))
                        .foregroundStyle(Theme.categoryColor(asset.assetCategory))

                    Text(asset.currentAmount.formatted(.number.precision(.fractionLength(0...8)))
                         + " " + asset.displayTicker)
                        .font(Theme.largeValue)

                    Text(asset.assetCategory.displayName)
                        .font(Theme.captionFont)
                        .foregroundStyle(Theme.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Theme.bgCard)
            }

            // Transactions section
            Section {
                if sortedTransactions.isEmpty {
                    Text("No transactions yet. Tap + to add one.")
                        .font(Theme.bodyFont)
                        .foregroundStyle(Theme.textMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                } else {
                    ForEach(sortedTransactions.prefix(5)) { txn in
                        TransactionRow(transaction: txn, asset: asset)
                    }
                    .onDelete { indexSet in
                        let previewTransactions = Array(sortedTransactions.prefix(5))
                        for index in indexSet {
                            let txn = previewTransactions[index]
                            modelContext.delete(txn)
                        }
                        // Persist deletion before recomputing to ensure currentAmount
                        // doesn't include the deleted transaction
                        try? modelContext.save()
                        asset.amount = asset.currentAmount
                    }

                    if sortedTransactions.count > 5 {
                        NavigationLink {
                            TransactionListView(asset: asset)
                        } label: {
                            Text("View All Transactions (\(sortedTransactions.count))")
                                .font(Theme.bodyFont)
                                .foregroundStyle(Theme.accent)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                        .listRowBackground(Theme.bgCard)
                    }
                }
            } header: {
                Text("Transactions")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bgPrimary)
        .navigationTitle(asset.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 16) {
                    Button {
                        showingEditSheet = true
                    } label: {
                        Text("Edit")
                    }
                    Button {
                        showingAddTransaction = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            EditAssetView(asset: asset)
        }
        .sheet(isPresented: $showingAddTransaction) {
            AddTransactionView(asset: asset)
        }
    }

    private var sortedTransactions: [Transaction] {
        (asset.transactions ?? []).sorted { $0.date > $1.date }
    }
}

// MARK: - Transaction Row (shared with TransactionListView)

struct TransactionRow: View {
    let transaction: Transaction
    let asset: Asset

    var body: some View {
        HStack(spacing: 12) {
            typeBadge

            VStack(alignment: .leading, spacing: 4) {
                Text(amountText)
                    .font(Theme.headlineFont)

                Text(transaction.date, style: .date)
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
            }

            Spacer()

            if let note = transaction.note, !note.isEmpty {
                Text(note)
                    .font(Theme.captionFont)
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
                    .frame(maxWidth: 120, alignment: .trailing)
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(Theme.bgCard)
    }

    private var typeBadge: some View {
        Text(transaction.type == .delta ? "Δ" : "S")
            .font(Theme.captionFont.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(
                Circle().fill(transaction.type == .delta ? Theme.sage : Theme.lavender)
            )
    }

    private var amountText: String {
        let formatted = transaction.amount.formatted(.number.precision(.fractionLength(0...8)))
        switch transaction.type {
        case .delta:
            let sign = transaction.amount >= 0 ? "+" : ""
            return "\(sign)\(formatted) \(asset.displayTicker)"
        case .snapshot:
            return "→ \(formatted) \(asset.displayTicker)"
        }
    }
}
