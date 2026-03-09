import SwiftUI

struct ContentView: View {
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
}
