import SwiftUI

struct TransactionListView: View {
    let asset: Asset
    var onUpdate: (() async -> Void)?
    @State private var transactions: [Transaction] = []
    @State private var showingAddTransaction = false

    private var sortedTransactions: [Transaction] {
        transactions.sorted { $0.parsedDate > $1.parsedDate }
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
                        let allTxns = sortedTransactions
                        Task {
                            for index in indexSet {
                                let txn = allTxns[index]
                                do {
                                    try await UserAPIClient.shared.delete(path: "/user/assets/\(asset.id)/transactions/\(txn.id)")
                                } catch {
                                    print("[Summa] Failed to delete transaction: \(error)")
                                }
                            }
                            await loadTransactions()
                            await onUpdate?()
                        }
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
            AddTransactionView(asset: asset) {
                await loadTransactions()
                await onUpdate?()
            }
        }
        .task {
            await loadTransactions()
        }
    }

    private func loadTransactions() async {
        do {
            let response: TransactionListResponse = try await UserAPIClient.shared.get(path: "/user/assets/\(asset.id)/transactions")
            transactions = response.transactions
        } catch {
            print("[Summa] Failed to fetch transactions: \(error)")
        }
    }
}
