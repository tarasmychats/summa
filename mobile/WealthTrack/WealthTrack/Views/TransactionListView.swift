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

// MARK: - Transaction Row

private struct TransactionRow: View {
    let transaction: Transaction
    let asset: Asset

    var body: some View {
        HStack(spacing: 12) {
            // Type badge
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
    }

    private var typeBadge: some View {
        Text(transaction.type == .delta ? "Δ" : "S")
            .font(.system(size: 13, weight: .bold, design: .rounded))
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
