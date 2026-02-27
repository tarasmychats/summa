import SwiftUI
import SwiftData

struct ContentView: View {
    @Query private var assets: [Asset]

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "chart.pie.fill")
                }

            ProjectionsView()
                .tabItem {
                    Label("Projections", systemImage: "chart.line.uptrend.xyaxis")
                }

            InsightsView()
                .tabItem {
                    Label("Insights", systemImage: "lightbulb.fill")
                }
        }
        .tint(Theme.sage)
    }
}

#Preview {
    ContentView()
        .modelContainer(for: Asset.self, inMemory: true)
}
