import SwiftUI
import SwiftData

@main
struct WealthTrackApp: App {
    let modelContainer: ModelContainer

    init() {
        let schema = Schema([Asset.self, UserSettings.self, Transaction.self])
        let config = ModelConfiguration(
            schema: schema,
            cloudKitDatabase: .automatic
        )
        do {
            modelContainer = try ModelContainer(
                for: schema,
                configurations: [config]
            )
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(modelContainer)
    }
}
