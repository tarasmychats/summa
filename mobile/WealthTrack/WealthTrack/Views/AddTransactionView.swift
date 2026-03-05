import SwiftUI
import SwiftData

struct AddTransactionView: View {
    let asset: Asset
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""
    @State private var type: TransactionType = .delta
    @State private var isSubtract = false
    @State private var date = Date()
    @State private var note = ""
    @State private var savedTrigger = 0

    private var parsedAmount: Double? {
        guard let raw = Double(amount) ?? {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.locale = .current
            return formatter.number(from: amount)?.doubleValue
        }() else { return nil }
        return type == .delta && isSubtract ? -raw : raw
    }

    private var isValid: Bool {
        guard let value = parsedAmount else { return false }
        switch type {
        case .delta:
            return value != 0
        case .snapshot:
            return value >= 0
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }
                .listRowBackground(Theme.bgCard)

                Section {
                    Picker("Type", selection: $type) {
                        Text("Add/Subtract").tag(TransactionType.delta)
                        Text("Set Total").tag(TransactionType.snapshot)
                    }
                    .pickerStyle(.segmented)
                }
                .listRowBackground(Theme.bgCard)

                Section {
                    HStack {
                        if type == .delta {
                            Button {
                                isSubtract.toggle()
                            } label: {
                                Image(systemName: isSubtract ? "minus.circle.fill" : "plus.circle.fill")
                                    .foregroundStyle(isSubtract ? Theme.coral : Theme.sage)
                                    .font(.title2)
                            }
                            .buttonStyle(.plain)
                        }
                        TextField(type == .delta ? "Amount" : "New total", text: $amount)
                            .keyboardType(.decimalPad)
                    }
                }
                .listRowBackground(Theme.bgCard)

                Section {
                    TextField("Note (optional)", text: $note)
                }
                .listRowBackground(Theme.bgCard)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bgPrimary)
            .sensoryFeedback(.success, trigger: savedTrigger)
            .navigationTitle("Add Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!isValid)
                }
            }
        }
    }

    private func save() {
        guard let value = parsedAmount, isValid else { return }

        // When adding the first delta transaction, create a baseline snapshot
        // to preserve the asset's existing amount. Without this, the transaction
        // replay (which starts from 0) would lose the original balance.
        let existingTxns = asset.transactions ?? []
        if existingTxns.isEmpty && type == .delta && asset.amount != 0 {
            let baseline = Transaction(
                date: date.addingTimeInterval(-1),
                type: .snapshot,
                amount: asset.amount,
                note: "Starting balance"
            )
            baseline.asset = asset
            modelContext.insert(baseline)
        }

        let txn = Transaction(
            date: date,
            type: type,
            amount: value,
            note: note.isEmpty ? nil : note
        )
        txn.asset = asset
        modelContext.insert(txn)
        try? modelContext.save()
        asset.amount = asset.currentAmount
        savedTrigger += 1
        dismiss()
    }
}
