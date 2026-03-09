import SwiftUI

struct AssetDetailView: View {
    let asset: Asset
    var onUpdate: (() async -> Void)?
    @State private var transactions: [Transaction] = []
    @State private var showingAddTransaction = false
    @State private var showingSetTotal = false
    @State private var displayCurrency: String = "USD"

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
                        Task {
                            for index in indexSet {
                                let txn = previewTransactions[index]
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

                    if sortedTransactions.count > 5 {
                        NavigationLink {
                            TransactionListView(asset: asset, onUpdate: onUpdate)
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
                        showingSetTotal = true
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
        .sheet(isPresented: $showingSetTotal) {
            AddTransactionView(asset: asset, initialMode: .setTotal) {
                await loadTransactions()
                await onUpdate?()
            }
        }
        .sheet(isPresented: $showingAddTransaction) {
            AddTransactionView(asset: asset) {
                await loadTransactions()
                await onUpdate?()
            }
        }
        .task {
            await loadSettings()
            await loadTransactions()
        }
    }

    private var sortedTransactions: [Transaction] {
        transactions.sorted { $0.parsedDate > $1.parsedDate }
    }

    private func loadSettings() async {
        do {
            let response: SettingsResponse = try await UserAPIClient.shared.get(path: "/user/settings")
            displayCurrency = response.settings.displayCurrency
        } catch {
            print("[Summa] Failed to fetch settings: \(error)")
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

                Text(transaction.parsedDate, style: .date)
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
        let isPositive = transaction.amount >= 0
        return Text(isPositive ? "+" : "\u{2212}")
            .font(Theme.captionFont.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(
                Circle().fill(isPositive ? Theme.sage : Theme.coral)
            )
    }

    private var amountText: String {
        let formatted = transaction.amount.formatted(.number.precision(.fractionLength(0...8)))
        let sign = transaction.amount >= 0 ? "+" : ""
        return "\(sign)\(formatted) \(asset.displayTicker)"
    }
}
