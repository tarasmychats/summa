import SwiftUI
import AuthenticationServices

struct SettingsView: View {
    @State private var settings: UserSettings?
    @State private var selectedCurrency: String = "USD"
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false

    private let supportedCurrencies = ["USD", "EUR"]

    var body: some View {
        Form {
            Section {
                Picker("Base Currency", selection: $selectedCurrency) {
                    ForEach(supportedCurrencies, id: \.self) { currency in
                        Text(currencyLabel(currency)).tag(currency)
                    }
                }
                .onChange(of: selectedCurrency) { _, newValue in
                    Task { await updateCurrency(newValue) }
                }
            } header: {
                Text("Display")
            } footer: {
                Text("All portfolio values will be shown in this currency.")
            }

            Section {
                if AuthManager.shared.authType == "apple" {
                    Label("Signed in with Apple", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Theme.sage)
                } else {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = []
                    } onCompletion: { result in
                        handleAppleSignIn(result)
                    }
                    .signInWithAppleButtonStyle(.whiteOutline)
                    .frame(height: 44)
                }
            } header: {
                Text("Account")
            } footer: {
                if AuthManager.shared.authType != "apple" {
                    Text("Sign in with Apple to back up your data and sync across devices.")
                }
            }

            Section {
                Button("Delete Account", role: .destructive) {
                    showDeleteConfirmation = true
                }
                .disabled(isDeleting)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadSettings()
        }
        .alert("Delete Account?", isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task {
                    isDeleting = true
                    do {
                        try await AuthManager.shared.deleteAccount()
                    } catch {
                        print("[Summa] Failed to delete account: \(error)")
                    }
                    isDeleting = false
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently delete your account and all data. This action cannot be undone.")
        }
    }

    private func loadSettings() async {
        do {
            let response: SettingsResponse = try await UserAPIClient.shared.get(path: "/user/settings")
            settings = response.settings
            selectedCurrency = response.settings.displayCurrency
        } catch {
            print("[Summa] Failed to fetch settings: \(error)")
        }
    }

    private func updateCurrency(_ currency: String) async {
        do {
            let body = UpdateSettingsRequest(displayCurrency: currency)
            let response: SettingsResponse = try await UserAPIClient.shared.patch(path: "/user/settings", body: body)
            settings = response.settings
        } catch {
            print("[Summa] Failed to update currency: \(error)")
        }
    }

    private func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let identityToken = credential.identityToken else {
                print("[Summa] Apple Sign In: missing identity token")
                return
            }
            Task {
                do {
                    try await AuthManager.shared.signInWithApple(identityToken: identityToken)
                } catch {
                    print("[Summa] Apple Sign In failed: \(error)")
                }
            }
        case .failure(let error):
            print("[Summa] Apple Sign In error: \(error)")
        }
    }

    private func currencyLabel(_ code: String) -> String {
        switch code {
        case "USD": return "USD ($)"
        case "EUR": return "EUR (\u{20AC})"
        default: return code
        }
    }
}
