import SwiftUI
import SwiftData

// Placeholder — full implementation in Task 16
struct AddTransactionView: View {
    let asset: Asset
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""
    @State private var type: TransactionType = .delta
    @State private var date = Date()
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Date", selection: $date, displayedComponents: .date)

                Picker("Type", selection: $type) {
                    Text("Add/Subtract").tag(TransactionType.delta)
                    Text("Set Total").tag(TransactionType.snapshot)
                }
                .pickerStyle(.segmented)

                TextField("Amount", text: $amount)
                    .keyboardType(.decimalPad)

                TextField("Note (optional)", text: $note)
            }
            .navigationTitle("Add Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let value = Double(amount), value != 0 else { return }
                        let txn = Transaction(
                            date: date,
                            type: type,
                            amount: type == .delta ? value : value,
                            note: note.isEmpty ? nil : note
                        )
                        txn.asset = asset
                        modelContext.insert(txn)
                        asset.amount = asset.currentAmount
                        dismiss()
                    }
                    .disabled(Double(amount) == nil || Double(amount) == 0)
                }
            }
        }
    }
}
