import Foundation

struct Insight: Identifiable {
    let id: String
    let title: String
    let message: String
    let severity: Severity

    enum Severity {
        case info, warning
    }
}

enum InsightsEngine {
    static func generate(holdings: [PortfolioHolding]) -> [Insight] {
        let breakdown = PortfolioCalculator.categoryBreakdown(holdings: holdings)
        var insights: [Insight] = []

        let cryptoShare = breakdown[.crypto] ?? 0
        let cashShare = breakdown[.fiat] ?? 0
        let stockShare = breakdown[.stock] ?? 0

        if cryptoShare > 0.70 {
            insights.append(Insight(
                id: "high_crypto",
                title: "High Crypto Exposure",
                message: "Crypto is highly volatile. Your portfolio could drop 50%+ in a downturn. Consider diversifying into index funds or cash.",
                severity: .warning
            ))
        }

        if cashShare > 0.50 {
            insights.append(Insight(
                id: "high_cash",
                title: "Cash Losing Value",
                message: "Cash loses ~3% per year to inflation. Historically, index funds like S&P 500 have returned ~8% per year.",
                severity: .info
            ))
        }

        if stockShare == 0 && holdings.count > 1 {
            insights.append(Insight(
                id: "no_index_funds",
                title: "No Index Funds",
                message: "Index funds offer moderate risk with historically strong returns (~8%/yr). They're a common building block of diversified portfolios.",
                severity: .info
            ))
        }

        return insights
    }
}
