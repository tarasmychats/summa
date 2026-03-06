import Foundation

/// Helpers for interactive chart selection — finding the nearest data point to a given date.
/// Extracted as pure functions so they are testable without SwiftUI or Charts dependencies.
enum ChartSelectionHelper {

    /// Finds the index of the data point whose date is nearest to `targetDate`.
    /// - Parameters:
    ///   - dates: Sorted array of dates from the chart data points.
    ///   - targetDate: The date the user dragged to.
    /// - Returns: The index of the nearest date, or `nil` if `dates` is empty.
    static func nearestIndex(in dates: [Date], to targetDate: Date) -> Int? {
        guard !dates.isEmpty else { return nil }

        let target = targetDate.timeIntervalSince1970

        // Binary search for the insertion point
        var low = 0
        var high = dates.count - 1

        while low < high {
            let mid = (low + high) / 2
            if dates[mid].timeIntervalSince1970 < target {
                low = mid + 1
            } else {
                high = mid
            }
        }

        // low is now the insertion point — compare with the previous element
        if low == 0 {
            return 0
        }

        let distPrev = abs(dates[low - 1].timeIntervalSince1970 - target)
        let distCurr = abs(dates[low].timeIntervalSince1970 - target)
        return distPrev <= distCurr ? low - 1 : low
    }
}
