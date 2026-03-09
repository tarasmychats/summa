import SwiftUI

struct AddTransactionView: View {
    let asset: Asset
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""
    var initialMode: EntryMode? = nil
    var onSave: (() async -> Void)?

    @State private var mode: EntryMode = .addSubtract
    @State private var isSubtract = false
    @State private var date = Date()
    @State private var note = ""
    @State private var savedTrigger = 0
    @State private var isSaving = false

    enum EntryMode: String {
        case addSubtract
        case setTotal
    }

    private var parsedAmount: Double? {
        guard let raw = Double(amount) ?? {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.locale = .current
            return formatter.number(from: amount)?.doubleValue
        }() else { return nil }
        return raw
    }

    private var isValid: Bool {
        guard let value = parsedAmount, value > 0 else { return false }
        if mode == .addSubtract {
            return true
        } else {
            // "Set total" -- the computed delta must be non-zero
            let delta = value - asset.currentAmount
            return delta != 0
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
                    Picker("Type", selection: $mode) {
                        Text("Add/Subtract").tag(EntryMode.addSubtract)
                        Text("Set Total").tag(EntryMode.setTotal)
                    }
                    .pickerStyle(.segmented)
                }
                .listRowBackground(Theme.bgCard)

                Section {
                    HStack {
                        if mode == .addSubtract {
                            Button {
                                isSubtract.toggle()
                            } label: {
                                Image(systemName: isSubtract ? "minus.circle.fill" : "plus.circle.fill")
                                    .foregroundStyle(isSubtract ? Theme.coral : Theme.sage)
                                    .font(.title2)
                            }
                            .buttonStyle(.plain)
                        }
                        TextField(mode == .addSubtract ? "Amount" : "New total", text: $amount)
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
            .onAppear {
                if let initialMode {
                    mode = initialMode
                }
            }
            .navigationTitle("Add Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!isValid || isSaving)
                }
            }
        }
    }

    private func save() {
        guard let value = parsedAmount, isValid else { return }
        isSaving = true

        let deltaAmount: Double
        let txnNote: String?

        switch mode {
        case .addSubtract:
            deltaAmount = isSubtract ? -value : value
            txnNote = note.isEmpty ? nil : note
        case .setTotal:
            deltaAmount = value - asset.currentAmount
            let formatted = value.formatted(.number.precision(.fractionLength(0...8)))
            txnNote = note.isEmpty ? "Set total to \(formatted)" : note
        }

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime]

        Task {
            do {
                let createTxn = CreateTransactionRequest(
                    type: "delta",
                    amount: deltaAmount,
                    date: dateFormatter.string(from: date),
                    note: txnNote
                )
                let _: TransactionResponse = try await UserAPIClient.shared.post(
                    path: "/user/assets/\(asset.id)/transactions",
                    body: createTxn
                )
                savedTrigger += 1
                await onSave?()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    dismiss()
                }
            } catch {
                print("[Summa] Failed to save transaction: \(error)")
                isSaving = false
            }
        }
    }
}
