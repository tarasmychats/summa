import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var allSettings: [UserSettings]

    private let supportedCurrencies = ["USD", "EUR"]

    var body: some View {
        Form {
            if let settings = allSettings.first {
                Section {
                    Picker("Base Currency", selection: Bindable(settings).displayCurrency) {
                        ForEach(supportedCurrencies, id: \.self) { currency in
                            Text(currencyLabel(currency)).tag(currency)
                        }
                    }
                } header: {
                    Text("Display")
                } footer: {
                    Text("All portfolio values will be shown in this currency.")
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func currencyLabel(_ code: String) -> String {
        switch code {
        case "USD": return "USD ($)"
        case "EUR": return "EUR (€)"
        default: return code
        }
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
    .modelContainer(for: UserSettings.self, inMemory: true)
}
