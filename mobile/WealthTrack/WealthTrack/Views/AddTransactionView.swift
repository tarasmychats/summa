import SwiftUI
import SwiftData

struct AddTransactionView: View {
    let asset: Asset
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""
    @State private var type: TransactionType = .delta
    @State private var date = Date()
    @State private var note = ""

    private var parsedAmount: Double? {
        if let value = Double(amount) { return value }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = .current
        return formatter.number(from: amount)?.doubleValue
    }

    private var isValid: Bool {
        guard let value = parsedAmount else { return false }
        switch type {
        case .delta:
            return value != 0
        case .snapshot:
            return value > 0
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
                    TextField(type == .delta ? "Amount (+/-)" : "New total", text: $amount)
                        .keyboardType(.decimalPad)
                }
                .listRowBackground(Theme.bgCard)

                Section {
                    TextField("Note (optional)", text: $note)
                }
                .listRowBackground(Theme.bgCard)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bgPrimary)
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
        let txn = Transaction(
            date: date,
            type: type,
            amount: value,
            note: note.isEmpty ? nil : note
        )
        txn.asset = asset
        modelContext.insert(txn)
        asset.amount = asset.currentAmount
        dismiss()
    }
}
