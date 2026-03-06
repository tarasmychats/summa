import SwiftUI
import SwiftData

@main
struct SummaApp: App {
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

        // Ensure UserSettings singleton exists on first launch
        let context = modelContainer.mainContext
        let descriptor = FetchDescriptor<UserSettings>()
        let existing = (try? context.fetch(descriptor)) ?? []
        if existing.isEmpty {
            context.insert(UserSettings())
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(modelContainer)
    }
}
