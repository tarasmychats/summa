import SwiftUI
import SwiftData

struct TransactionListView: View {
    let asset: Asset
    @Environment(\.modelContext) private var modelContext
    @State private var showingAddTransaction = false

    private var sortedTransactions: [Transaction] {
        (asset.transactions ?? []).sorted { $0.date > $1.date }
    }

    var body: some View {
        Group {
            if sortedTransactions.isEmpty {
                ContentUnavailableView(
                    "No transactions yet",
                    systemImage: "list.bullet.rectangle",
                    description: Text("Tap + to record your first transaction for \(asset.name).")
                )
            } else {
                List {
                    ForEach(sortedTransactions) { txn in
                        TransactionRow(transaction: txn, asset: asset)
                            .listRowBackground(Theme.bgCard)
                    }
                    .onDelete { indexSet in
                        for index in indexSet {
                            modelContext.delete(sortedTransactions[index])
                        }
                        try? modelContext.save()
                        asset.amount = asset.currentAmount
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.bgPrimary)
        .navigationTitle("Transactions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingAddTransaction = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddTransaction) {
            AddTransactionView(asset: asset)
        }
    }
}
