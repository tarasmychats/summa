import SwiftUI

@main
struct SummaApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .task {
                    try? await AuthManager.shared.ensureAuthenticated()
                }
        }
    }
}
