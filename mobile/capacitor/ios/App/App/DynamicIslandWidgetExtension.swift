#if canImport(WidgetKit) && canImport(ActivityKit)
// Create a minimal Widget extension entry point implementing the Live Activity UI for Lock Screen and Dynamic Island.
// NOTE: You must add a Widget Extension target in Xcode and include this file there for proper build settings and entitlements.

import WidgetKit
import SwiftUI
import ActivityKit

// NOTE: In your Widget Extension target, you should add @main to this bundle.
@available(iOS 16.1, *)
struct DynamicIslandWidgetBundle: WidgetBundle {
    var body: some Widget {
        DynamicIslandWidget()
    }
}

@available(iOS 16.1, *)
struct DynamicIslandWidget: Widget {
    let kind: String = "DynamicIslandWidget"
    
    @available(iOS 16.1, *)
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GenericProgressAttributes.self) { context in
            // Lock screen / banner presentation
            VStack(alignment: .leading, spacing: 6) {
                Text(context.attributes.title)
                    .font(.headline)
                if let subtitle = context.state.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                ProgressView(value: min(max(context.state.progress, 0.0), 1.0))
            }
            .padding()
            .activityBackgroundTint(.clear)
            .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                // Keep expanded content minimal and centered to avoid overlap conflicts
                DynamicIslandExpandedRegion(.center) {
                    HStack(spacing: 8) {
                        Image(systemName: context.state.progress >= 1.0 ? "checkmark.circle.fill" : "clock.fill")
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.attributes.title)
                                .font(.headline)
                            if let subtitle = context.state.subtitle, !subtitle.isEmpty {
                                Text(subtitle)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            ProgressView(value: min(max(context.state.progress, 0.0), 1.0))
                                .progressViewStyle(.linear)
                        }
                    }
                }
            } compactLeading: {
                // Compact leading - concise percentage
                Text("\(Int(context.state.progress * 100))%")
                    .monospacedDigit()
            } compactTrailing: {
                // Compact trailing - status icon
                Image(systemName: context.state.progress >= 1.0 ? "checkmark.circle" : "clock")
            } minimal: {
                // Minimal - single status glyph
                Image(systemName: context.state.progress >= 1.0 ? "checkmark" : "clock")
            }
        }
        .configurationDisplayName("Progress Activity")
        .description("Shows task progress in the Dynamic Island and on the Lock Screen.")
    }
}

#endif
