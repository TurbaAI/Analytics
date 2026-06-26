import AVFoundation
import Contacts
import ContactsUI
import PhotosUI
import SwiftUI
import UIKit
import UserNotifications

struct TurbalanceNativeAppView: View {
    @StateObject private var model = AnalyticsViewModel()
    @State private var isEditingProfile = false

    var body: some View {
        ZStack {
            AppColor.background.ignoresSafeArea()
            VStack(spacing: 0) {
                HeaderView(model: model) {
                    isEditingProfile = true
                }
                PageTabBar(selection: $model.page)

                ScrollView {
                    VStack(spacing: 14) {
                        switch model.page {
                        case .cockpit:
                            CockpitView(snapshot: model.snapshot, history: model.history)
                        case .hosts:
                            HostsView(
                                snapshot: model.snapshot,
                                query: $model.hostSearchText,
                                filter: $model.hostFilter,
                                selectedHost: $model.selectedHost
                            )
                        case .trends:
                            TrendsView(snapshot: model.snapshot, history: model.history)
                        case .signals:
                            SignalsView(snapshot: model.snapshot)
                        case .notifications:
                            NotificationsView(model: model)
                        case .report:
                            CustomerReportView(model: model)
                        case .ops:
                            OpsView(model: model)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 28)
                }
                .refreshable {
                    await model.refresh()
                }
            }
        }
        .sheet(item: $model.selectedHost) { host in
            HostDetailView(host: host)
        }
        .sheet(isPresented: $isEditingProfile) {
            ProfileEditorView(model: model)
        }
        .onAppear {
            model.loadIfNeeded()
        }
    }
}

private struct HeaderView: View {
    @ObservedObject var model: AnalyticsViewModel
    let editProfile: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Image("TurbalanceWordmark")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .foregroundColor(.white)
                        .frame(width: 220, height: 38, alignment: .leading)
                    Text("Analytics")
                        .font(.headline.weight(.heavy))
                        .foregroundColor(AppColor.cyan)
                }
                Spacer()
                HeaderIconButton(
                    systemImage: model.autoRefreshEnabled ? "pause.fill" : "play.fill",
                    label: model.autoRefreshEnabled ? "Pause automatic refresh" : "Resume automatic refresh"
                ) {
                    model.setAutoRefreshEnabled(!model.autoRefreshEnabled)
                }
                HeaderIconButton(
                    systemImage: model.isRefreshing ? "arrow.triangle.2.circlepath" : "arrow.clockwise",
                    label: "Refresh live telemetry"
                ) {
                    Task { await model.refresh() }
                }
            }

            HStack(spacing: 12) {
                Button(action: editProfile) {
                    HStack(spacing: 12) {
                        UserAvatar(profile: model.userProfile)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.userProfile.displayName)
                                .font(.title3.weight(.bold))
                                .foregroundColor(.white)
                                .lineLimit(1)
                            Text("\(model.userProfile.detail) · \(model.freshnessText)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(AppColor.headerMuted)
                                .lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit profile name and photo")
                Spacer()
                FeedBadge(label: model.feedLabel, tone: model.feedTone)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 18)
        .background(AppColor.header)
    }
}

private struct ProfileEditorView: View {
    @ObservedObject var model: AnalyticsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var draftName: String
    @State private var isPickingContact = false
    @State private var isPickingImage = false

    init(model: AnalyticsViewModel) {
        self.model = model
        _draftName = State(initialValue: model.userProfile.displayName == "Set your name" ? "" : model.userProfile.displayName)
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 14) {
                NativePanel(title: "Profile", subtitle: model.userProfile.detail) {
                    VStack(spacing: 12) {
                        UserAvatar(profile: model.userProfile)
                            .frame(width: 72, height: 72)

                        TextField("Name shown in the header", text: $draftName)
                            .textInputAutocapitalization(.words)
                            .disableAutocorrection(true)
                            .font(.subheadline.weight(.semibold))
                            .padding(12)
                            .background(AppColor.track)
                            .cornerRadius(7)

                        HStack(spacing: 10) {
                            IconTextButton(title: "Use name", systemImage: "checkmark.circle.fill", color: AppColor.green) {
                                model.setUserDisplayName(draftName)
                                dismiss()
                            }
                            IconTextButton(title: "Contact", systemImage: "person.crop.circle.fill", color: AppColor.blue) {
                                isPickingContact = true
                            }
                        }

                        IconTextButton(title: "Set photo", systemImage: "photo.fill", color: AppColor.violet) {
                            isPickingImage = true
                        }
                    }
                }

                NativePanel(title: "iPhone privacy", subtitle: "local only") {
                    Text("iOS does not expose the Apple ID owner name to apps. Choose your contact or type your name once, and turbalance will save it locally on this iPhone.")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(AppColor.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer()
            }
            .padding(16)
            .background(AppColor.background.ignoresSafeArea())
            .navigationTitle("Header Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.body.weight(.bold))
                }
            }
        }
        .sheet(isPresented: $isPickingContact) {
            ProfileContactPicker { name in
                draftName = name
                model.setUserDisplayName(name)
            }
        }
        .sheet(isPresented: $isPickingImage) {
            ProfileImagePicker { imageData in
                model.setUserProfileImage(imageData)
            }
        }
    }
}

private struct ProfileContactPicker: UIViewControllerRepresentable {
    let onName: (String) -> Void
    @Environment(\.presentationMode) private var presentationMode

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: CNContactPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject, CNContactPickerDelegate {
        private let parent: ProfileContactPicker

        init(parent: ProfileContactPicker) {
            self.parent = parent
        }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            let formattedName = CNContactFormatter.string(from: contact, style: .fullName)
                ?? [contact.givenName, contact.familyName]
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                    .joined(separator: " ")
            parent.onName(formattedName)
            parent.presentationMode.wrappedValue.dismiss()
        }

        func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
            parent.presentationMode.wrappedValue.dismiss()
        }
    }
}

private struct ProfileImagePicker: UIViewControllerRepresentable {
    let onImageData: (Data) -> Void
    @Environment(\.presentationMode) private var presentationMode

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.filter = .images
        configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        private let parent: ProfileImagePicker

        init(parent: ProfileImagePicker) {
            self.parent = parent
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            parent.presentationMode.wrappedValue.dismiss()
            guard let provider = results.first?.itemProvider,
                  provider.canLoadObject(ofClass: UIImage.self) else { return }

            provider.loadObject(ofClass: UIImage.self) { object, _ in
                guard let image = object as? UIImage,
                      let imageData = Self.avatarData(from: image) else { return }
                DispatchQueue.main.async {
                    self.parent.onImageData(imageData)
                }
            }
        }

        private static func avatarData(from image: UIImage) -> Data? {
            let maxSide: CGFloat = 512
            let scale = min(maxSide / max(image.size.width, image.size.height), 1)
            let targetSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let renderer = UIGraphicsImageRenderer(size: targetSize)
            let rendered = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: targetSize))
            }
            return rendered.jpegData(compressionQuality: 0.82)
        }
    }
}

private struct PageTabBar: View {
    @Binding var selection: DashboardPage

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(DashboardPage.allCases) { page in
                    Button {
                        selection = page
                    } label: {
                        Label(page.rawValue, systemImage: page.systemImage)
                            .font(.caption.weight(.black))
                            .foregroundColor(selection == page ? .white : AppColor.ink)
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(selection == page ? AppColor.green : AppColor.surface)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(selection == page ? AppColor.green : AppColor.line, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(AppColor.background)
    }
}

private struct UserAvatar: View {
    let profile: DeviceUserProfile

    var body: some View {
        ZStack {
            Circle().fill(AppColor.avatar)
            if let data = profile.imageData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(profile.initials)
                    .font(.headline.weight(.black))
                    .foregroundColor(AppColor.ink)
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(Circle())
    }
}

private struct HeaderIconButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.headline.weight(.bold))
                .frame(width: 42, height: 42)
                .background(AppColor.headerButton)
                .clipShape(Circle())
                .foregroundColor(.white)
        }
        .accessibilityLabel(label)
    }
}

private struct CockpitView: View {
    let snapshot: AnalyticsSnapshot
    let history: [TelemetryHistoryPoint]
    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        VStack(spacing: 14) {
            SectionHeader(title: "Fleet cockpit", detail: snapshot.observedHost)
            LazyVGrid(columns: columns, spacing: 10) {
                MetricTile(title: "Hosts", value: "\(snapshot.summary.hostCount)", systemImage: "server.rack")
                MetricTile(title: "Health", value: snapshot.summary.averageHealthScore.formattedPct, systemImage: "checkmark.seal.fill")
                MetricTile(title: "GPU", value: snapshot.summary.averageGpuPct.formattedPct, systemImage: "bolt.fill")
                MetricTile(title: "Actions", value: "\(snapshot.summary.actionCount)", systemImage: "exclamationmark.triangle.fill")
            }

            NativePanel(title: "Fleet health", subtitle: snapshot.freshnessLabel) {
                HStack(spacing: 16) {
                    HealthGauge(value: snapshot.summary.averageHealthScore)
                        .frame(width: 92, height: 92)
                    VStack(spacing: 12) {
                        BarMetric(title: "CPU load", value: snapshot.summary.averageCpuPct, color: AppColor.blue)
                        BarMetric(title: "Memory use", value: snapshot.summary.averageMemoryPct, color: AppColor.green)
                        BarMetric(title: "Disk use", value: snapshot.summary.averageDiskPct, color: AppColor.amber)
                    }
                }
            }

            NativePanel(title: "Live trend", subtitle: "\(history.count) samples") {
                VStack(spacing: 12) {
                    TrendSparkline(values: history.map(\.averageGpuPct), color: AppColor.violet)
                        .frame(height: 72)
                    HStack {
                        MiniMetric(title: "Network", value: "\(snapshot.summary.totalNetworkMBps.formattedCompact) MB/s")
                        MiniMetric(title: "Queue max", value: "\(snapshot.summary.maxQueueMinutes.formattedCompact)m")
                        MiniMetric(title: "Watch", value: "\(snapshot.summary.watchCount)")
                    }
                }
            }

            NativePanel(title: "Top signals", subtitle: "\(snapshot.signals.count) active") {
                VStack(spacing: 10) {
                    ForEach(snapshot.signals.prefix(4)) { signal in
                        SignalRow(signal: signal)
                    }
                }
            }
        }
    }
}

private struct HostsView: View {
    let snapshot: AnalyticsSnapshot
    @Binding var query: String
    @Binding var filter: HostStatusFilter
    @Binding var selectedHost: HostSnapshot?

    private var filteredHosts: [HostSnapshot] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return snapshot.hosts.filter { host in
            let matchesFilter = filter.includes(host)
            let matchesQuery = trimmedQuery.isEmpty
                || host.name.localizedCaseInsensitiveContains(trimmedQuery)
                || host.role.localizedCaseInsensitiveContains(trimmedQuery)
                || host.status.localizedCaseInsensitiveContains(trimmedQuery)
            return matchesFilter && matchesQuery
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            SectionHeader(title: "Hosts", detail: "\(filteredHosts.count) shown")

            TextField("Search hosts", text: $query)
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
                .font(.subheadline.weight(.semibold))
                .padding(12)
                .background(AppColor.surface)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(AppColor.line, lineWidth: 1)
                )

            Picker("", selection: $filter) {
                ForEach(HostStatusFilter.allCases) { item in
                    Text(item.rawValue).tag(item)
                }
            }
            .pickerStyle(.segmented)

            if filteredHosts.isEmpty {
                NativePanel(title: "No matching hosts", subtitle: filter.rawValue) {
                    Text("No observed host matches the current search and status filter.")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(AppColor.muted)
                }
            } else {
                ForEach(filteredHosts) { host in
                    Button {
                        selectedHost = host
                    } label: {
                        HostCard(host: host)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct TrendsView: View {
    let snapshot: AnalyticsSnapshot
    let history: [TelemetryHistoryPoint]

    var body: some View {
        VStack(spacing: 12) {
            SectionHeader(title: "Trends", detail: "\(history.count) samples")
            SparklinePanel(title: "GPU activity", value: snapshot.summary.averageGpuPct.formattedPct, values: history.map(\.averageGpuPct), color: AppColor.violet)
            SparklinePanel(title: "CPU load", value: snapshot.summary.averageCpuPct.formattedPct, values: history.map(\.averageCpuPct), color: AppColor.blue)
            SparklinePanel(title: "Memory pressure", value: snapshot.summary.averageMemoryPct.formattedPct, values: history.map(\.averageMemoryPct), color: AppColor.green)
            SparklinePanel(title: "Disk pressure", value: snapshot.summary.averageDiskPct.formattedPct, values: history.map(\.averageDiskPct), color: AppColor.amber)
            SparklinePanel(title: "Fleet health", value: snapshot.summary.averageHealthScore.formattedPct, values: history.map(\.averageHealthScore), color: AppColor.green)

            NativePanel(title: "Recent samples", subtitle: "last \(min(history.count, 6))") {
                VStack(spacing: 9) {
                    ForEach(history.suffix(6)) { point in
                        HStack {
                            Text(point.label)
                                .font(.caption.monospacedDigit().weight(.bold))
                                .foregroundColor(AppColor.muted)
                            Spacer()
                            Text("GPU \(point.averageGpuPct.formattedPct)")
                                .font(.caption.monospacedDigit().weight(.heavy))
                                .foregroundColor(AppColor.violet)
                            Text("CPU \(point.averageCpuPct.formattedPct)")
                                .font(.caption.monospacedDigit().weight(.heavy))
                                .foregroundColor(AppColor.blue)
                        }
                    }
                }
            }
        }
    }
}

private struct SignalsView: View {
    let snapshot: AnalyticsSnapshot

    var body: some View {
        VStack(spacing: 12) {
            SectionHeader(title: "Signals", detail: "\(snapshot.signals.count) findings")
            ForEach(snapshot.signals) { signal in
                NativePanel(title: signal.title, subtitle: signal.tone.label) {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: signal.tone.systemImage)
                            .font(.headline.weight(.bold))
                            .foregroundColor(signal.tone.color)
                            .frame(width: 24)
                        Text(signal.detail)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(AppColor.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(signal.tone.color)
                        .frame(width: 5)
                        .cornerRadius(3)
                }
            }
        }
    }
}

private struct NotificationsView: View {
    @ObservedObject var model: AnalyticsViewModel

    var body: some View {
        let breaches = model.currentThresholdBreaches

        VStack(spacing: 12) {
            SectionHeader(title: "Alerts", detail: model.notificationAuthorizationStatus.displayLabel)

            NativePanel(title: "Delivery", subtitle: model.notificationSettings.enabled ? "enabled" : "paused") {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle(isOn: Binding(
                        get: { model.notificationSettings.enabled },
                        set: { model.setNotificationsEnabled($0) }
                    )) {
                        Label("Threshold notifications", systemImage: "bell.badge.fill")
                            .font(.caption.weight(.heavy))
                            .foregroundColor(AppColor.ink)
                    }
                    .toggleStyle(SwitchToggleStyle(tint: AppColor.green))

                    OpsStateRow(title: "Permission", value: model.notificationAuthorizationStatus.displayLabel, systemImage: "iphone")
                    OpsStateRow(title: "Last alert", value: model.lastNotificationSummary, systemImage: "bell.and.waves.left.and.right.fill")

                    IconTextButton(title: "Test alert", systemImage: "bell.fill", color: AppColor.blue) {
                        model.sendTestNotification()
                    }
                }
            }

            NativePanel(title: "Thresholds", subtitle: "\(breaches.count) breached now") {
                VStack(spacing: 13) {
                    ThresholdSlider(title: "CPU load", mode: "Alert above", value: $model.notificationSettings.cpuPct, range: 1...100, step: 1, suffix: "%", systemImage: "gauge.medium")
                    ThresholdSlider(title: "GPU activity", mode: "Alert above", value: $model.notificationSettings.gpuPct, range: 1...100, step: 1, suffix: "%", systemImage: "bolt.fill")
                    ThresholdSlider(title: "Memory pressure", mode: "Alert above", value: $model.notificationSettings.memoryPct, range: 1...100, step: 1, suffix: "%", systemImage: "memorychip.fill")
                    ThresholdSlider(title: "Disk pressure", mode: "Alert above", value: $model.notificationSettings.diskPct, range: 1...100, step: 1, suffix: "%", systemImage: "internaldrive.fill")
                    ThresholdSlider(title: "Fleet health", mode: "Alert below", value: $model.notificationSettings.healthScore, range: 1...100, step: 1, suffix: "%", systemImage: "heart.text.square.fill")
                    ThresholdSlider(title: "Queue wait", mode: "Alert above", value: $model.notificationSettings.queueMinutes, range: 0...60, step: 1, suffix: "m", systemImage: "clock.fill")
                    ThresholdSlider(title: "Network", mode: "Alert above", value: $model.notificationSettings.networkMBps, range: 0...1000, step: 10, suffix: " MB/s", systemImage: "arrow.left.arrow.right")
                    ThresholdSlider(title: "Alert gap", mode: "Cooldown", value: $model.notificationSettings.minimumAlertIntervalMinutes, range: 1...60, step: 1, suffix: "m", systemImage: "timer")
                }
            }

            NativePanel(title: "Current threshold state", subtitle: breaches.isEmpty ? "clear" : "\(breaches.count) active") {
                VStack(spacing: 10) {
                    if breaches.isEmpty {
                        Label("No configured threshold is currently breached.", systemImage: "checkmark.seal.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(AppColor.green)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ForEach(breaches) { breach in
                            ThresholdBreachRow(breach: breach)
                        }
                    }
                }
            }
        }
        .onChange(of: model.notificationSettings) { _ in
            model.persistNotificationSettings()
        }
    }
}

private struct CustomerReportView: View {
    @ObservedObject var model: AnalyticsViewModel
    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        VStack(spacing: 12) {
            SectionHeader(title: "Report", detail: model.snapshot.sourceLabel)

            NativePanel(title: "Customer posture", subtitle: model.snapshot.freshnessLabel) {
                HStack(spacing: 16) {
                    HealthGauge(value: model.snapshot.summary.averageHealthScore)
                        .frame(width: 92, height: 92)
                    VStack(spacing: 8) {
                        MiniMetric(title: "Actions", value: "\(model.snapshot.summary.actionCount)")
                        MiniMetric(title: "Watch", value: "\(model.snapshot.summary.watchCount)")
                        MiniMetric(title: "Hosts", value: "\(model.snapshot.summary.hostCount)")
                    }
                }
            }

            NativePanel(title: "Fleet snapshot", subtitle: model.snapshot.observedHost) {
                LazyVGrid(columns: columns, spacing: 8) {
                    DetailMetric(title: "GPU", value: model.snapshot.summary.averageGpuPct.formattedPct, systemImage: "bolt.fill")
                    DetailMetric(title: "CPU", value: model.snapshot.summary.averageCpuPct.formattedPct, systemImage: "gauge.medium")
                    DetailMetric(title: "Memory", value: model.snapshot.summary.averageMemoryPct.formattedPct, systemImage: "memorychip.fill")
                    DetailMetric(title: "Disk", value: model.snapshot.summary.averageDiskPct.formattedPct, systemImage: "internaldrive.fill")
                    DetailMetric(title: "Network", value: "\(model.snapshot.summary.totalNetworkMBps.formattedCompact) MB/s", systemImage: "arrow.left.arrow.right")
                    DetailMetric(title: "Queue", value: "\(model.snapshot.summary.maxQueueMinutes.formattedCompact)m", systemImage: "clock.fill")
                }
            }

            NativePanel(title: "Customer actions", subtitle: "\(model.snapshot.signals.count) signals") {
                VStack(spacing: 10) {
                    ForEach(model.snapshot.signals.prefix(5)) { signal in
                        SignalRow(signal: signal)
                    }
                }
            }

            NativePanel(title: "Report text", subtitle: model.reportCopyState.isEmpty ? "ready" : model.reportCopyState) {
                VStack(alignment: .leading, spacing: 12) {
                    IconTextButton(title: "Copy report", systemImage: "doc.on.doc.fill", color: AppColor.green) {
                        model.copyCustomerReport()
                    }

                    Text(model.customerReportText)
                        .font(.caption.monospaced())
                        .foregroundColor(AppColor.ink)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(AppColor.track)
                        .cornerRadius(7)
                }
            }
        }
    }
}

private struct OpsView: View {
    @ObservedObject var model: AnalyticsViewModel
    @State private var showingPairingScanner = false

    var body: some View {
        VStack(spacing: 12) {
            SectionHeader(title: "Ops", detail: model.snapshot.sourceLabel)
            NativePanel(title: "Source adapters", subtitle: "\(model.snapshot.importedSources.count) sources") {
                FlowLayout(items: model.snapshot.importedSources.isEmpty ? ["local-sample"] : model.snapshot.importedSources)
            }
            NativePanel(title: "Live endpoint", subtitle: model.cachedSnapshotAvailable ? "cache ready" : "no cache") {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("Bundle URL", text: $model.endpointText)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .font(.caption.monospaced())
                        .padding(10)
                        .background(AppColor.track)
                        .cornerRadius(7)

                    HStack(spacing: 10) {
                        IconTextButton(title: "Save", systemImage: "checkmark.circle.fill", color: AppColor.green) {
                            model.saveEndpoint()
                        }
                        IconTextButton(title: "Reset", systemImage: "arrow.counterclockwise.circle.fill", color: AppColor.blue) {
                            model.resetEndpoint()
                        }
                    }

                    HStack(spacing: 10) {
                        IconTextButton(title: "Scan QR", systemImage: "qrcode.viewfinder", color: AppColor.blue) {
                            showingPairingScanner = true
                        }
                    }

                    if !model.pairingStatusMessage.isEmpty {
                        Label(model.pairingStatusMessage, systemImage: "link.circle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(AppColor.green)
                            .lineLimit(2)
                    }

                    Toggle(isOn: Binding(
                        get: { model.autoRefreshEnabled },
                        set: { model.setAutoRefreshEnabled($0) }
                    )) {
                        Label("Auto refresh", systemImage: "arrow.triangle.2.circlepath")
                            .font(.caption.weight(.heavy))
                            .foregroundColor(AppColor.ink)
                    }
                    .toggleStyle(SwitchToggleStyle(tint: AppColor.green))

                    if !model.lastErrorMessage.isEmpty {
                        Label(model.lastErrorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(AppColor.amber)
                            .lineLimit(3)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            NativePanel(title: "Bundle state", subtitle: model.snapshot.freshnessLabel) {
                VStack(spacing: 10) {
                    OpsStateRow(title: "Observed host", value: model.snapshot.observedHost, systemImage: "server.rack")
                    OpsStateRow(title: "History samples", value: "\(model.history.count)", systemImage: "waveform.path.ecg")
                    OpsStateRow(title: "Live status", value: model.feedLabel, systemImage: model.snapshot.isStale ? "clock.badge.exclamationmark" : "checkmark.seal")
                }
            }
        }
        .sheet(isPresented: $showingPairingScanner) {
            PairingScannerSheet { payload in
                model.applyPairingPayload(payload)
            }
        }
    }
}

private struct PairingScannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onScan: (String) -> Void

    var body: some View {
        NavigationView {
            QRCodeScannerView { payload in
                onScan(payload)
                dismiss()
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("Pairing QR")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct QRCodeScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerViewController {
        let controller = QRScannerViewController()
        controller.onScan = onScan
        return controller
    }

    func updateUIViewController(_ uiViewController: QRScannerViewController, context: Context) {
    }
}

private final class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String) -> Void)?

    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var didScan = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureCameraAccess()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        startSessionIfReady()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { [session] in
                session.stopRunning()
            }
        }
    }

    private func configureCameraAccess() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    granted ? self?.configureSession() : self?.showMessage("Camera access is required for QR pairing.")
                }
            }
        default:
            showMessage("Camera access is required for QR pairing.")
        }
    }

    private func configureSession() {
        guard previewLayer == nil else { return }
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            showMessage("Camera is unavailable on this iPhone.")
            return
        }

        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            showMessage("QR scanner is unavailable.")
            return
        }

        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer
        startSessionIfReady()
    }

    private func startSessionIfReady() {
        guard previewLayer != nil, !session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async { [session] in
            session.startRunning()
        }
    }

    private func showMessage(_ message: String) {
        view.subviews.forEach { $0.removeFromSuperview() }
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !didScan,
              let code = metadataObjects
                .compactMap({ $0 as? AVMetadataMachineReadableCodeObject })
                .compactMap(\.stringValue)
                .first else {
            return
        }
        didScan = true
        onScan?(code)
    }
}

private struct HostCard: View {
    let host: HostSnapshot

    var body: some View {
        NativePanel(title: host.name, subtitle: host.role) {
            VStack(spacing: 12) {
                HStack {
                    StatusPill(label: host.riskLabel, tone: host.riskTone)
                    Spacer()
                    Text("\(host.networkMBps.formattedCompact) MB/s")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundColor(AppColor.muted)
                }
                HStack(spacing: 12) {
                    HealthGauge(value: host.hardwareHealthScore)
                        .frame(width: 66, height: 66)
                    VStack(spacing: 9) {
                        BarMetric(title: "CPU", value: host.cpuPct, color: AppColor.blue)
                        BarMetric(title: "GPU", value: host.gpuPct, color: AppColor.violet)
                        BarMetric(title: "RAM", value: host.memoryPct, color: AppColor.green)
                    }
                }
                HStack(spacing: 8) {
                    MiniMetric(title: "Disk", value: host.diskPct.formattedPct)
                    MiniMetric(title: "Queue", value: "\(host.queueMinutes.formattedCompact)m")
                    MiniMetric(title: "Uptime", value: host.uptimeSeconds.formattedDuration)
                }
                Text(host.primaryAction)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(AppColor.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct HostDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let host: HostSnapshot
    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 14) {
                    NativePanel(title: host.name, subtitle: host.role) {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                HealthGauge(value: host.hardwareHealthScore)
                                    .frame(width: 92, height: 92)
                                VStack(alignment: .leading, spacing: 8) {
                                    StatusPill(label: host.riskLabel, tone: host.riskTone)
                                    Text(host.primaryAction)
                                        .font(.subheadline.weight(.bold))
                                        .foregroundColor(AppColor.ink)
                                }
                                Spacer()
                            }
                            LazyVGrid(columns: columns, spacing: 8) {
                                DetailMetric(title: "CPU", value: host.cpuPct.formattedPct, systemImage: "gauge.medium")
                                DetailMetric(title: "GPU", value: host.gpuPct.formattedPct, systemImage: "bolt.fill")
                                DetailMetric(title: "Memory", value: host.memoryPct.formattedPct, systemImage: "memorychip.fill")
                                DetailMetric(title: "Disk", value: host.diskPct.formattedPct, systemImage: "internaldrive.fill")
                                DetailMetric(title: "GPU mem", value: host.gpuMemoryPct.formattedPct, systemImage: "rectangle.stack.fill")
                                DetailMetric(title: "GPU temp", value: host.gpuTemperatureC > 0 ? "\(host.gpuTemperatureC.formattedCompact)C" : "n/a", systemImage: "thermometer.medium")
                            }
                        }
                    }

                    NativePanel(title: "Network", subtitle: host.networkInterface.isEmpty ? "unknown" : host.networkInterface) {
                        VStack(spacing: 10) {
                            BarMetric(title: "Utilization", value: host.networkUtilizationPct, color: AppColor.blue)
                            OpsStateRow(title: "Address", value: host.networkLocalAddress.isEmpty ? "n/a" : host.networkLocalAddress, systemImage: "network")
                            OpsStateRow(title: "Link speed", value: host.networkLinkSpeedMbps > 0 ? "\(host.networkLinkSpeedMbps.formattedCompact) Mbps" : "n/a", systemImage: "speedometer")
                            OpsStateRow(title: "Throughput", value: "\(host.networkMBps.formattedCompact) MB/s", systemImage: "arrow.left.arrow.right")
                        }
                    }

                    NativePanel(title: "GPU diagnostics", subtitle: host.hasGpuEvidence ? "observed" : "not present") {
                        VStack(spacing: 10) {
                            OpsStateRow(title: "Processes", value: host.gpuProcessSummary.isEmpty ? "n/a" : host.gpuProcessSummary, systemImage: "person.2.fill")
                            OpsStateRow(title: "Thermal", value: host.gpuThermalSummary.isEmpty ? "n/a" : host.gpuThermalSummary, systemImage: "thermometer.sun.fill")
                            OpsStateRow(title: "Topology", value: host.gpuTopologySummary.isEmpty ? "n/a" : host.gpuTopologySummary, systemImage: "point.3.connected.trianglepath.dotted")
                            OpsStateRow(title: "NCCL", value: host.ncclRuntimeStatus.isEmpty ? "n/a" : host.ncclRuntimeStatus, systemImage: "link")
                        }
                    }

                    NativePanel(title: "Model service", subtitle: host.ollamaStatus.isEmpty ? "unknown" : host.ollamaStatus) {
                        HStack(spacing: 8) {
                            MiniMetric(title: "tok/s", value: host.ollamaTokensPerSecond.formattedCompact)
                            MiniMetric(title: "TTFT", value: host.ollamaTimeToFirstTokenMs > 0 ? "\(host.ollamaTimeToFirstTokenMs.formattedCompact) ms" : "n/a")
                            MiniMetric(title: "Queue", value: "\(host.queueMinutes.formattedCompact)m")
                        }
                    }

                    NativePanel(title: "Services", subtitle: "\(host.observedServices.count) observed") {
                        FlowLayout(items: host.observedServices.isEmpty ? ["none"] : host.observedServices)
                    }

                    if !host.warnings.isEmpty {
                        NativePanel(title: "Warnings", subtitle: "\(host.warnings.count)") {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(host.warnings, id: \.self) { warning in
                                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                                        .font(.caption.weight(.semibold))
                                        .foregroundColor(AppColor.amber)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(16)
            }
            .background(AppColor.background.ignoresSafeArea())
            .navigationTitle(host.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.body.weight(.bold))
                }
            }
        }
    }
}

private struct ThresholdSlider: View {
    let title: String
    let mode: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let suffix: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.caption.weight(.bold))
                    .foregroundColor(AppColor.green)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.caption.weight(.heavy))
                        .foregroundColor(AppColor.ink)
                    Text(mode)
                        .font(.caption2.weight(.bold))
                        .foregroundColor(AppColor.muted)
                }
                Spacer()
                Text(formattedValue)
                    .font(.caption.monospacedDigit().weight(.black))
                    .foregroundColor(AppColor.ink)
            }

            Slider(value: $value, in: range, step: step)
                .tint(AppColor.green)
        }
        .padding(10)
        .background(AppColor.chip)
        .cornerRadius(7)
    }

    private var formattedValue: String {
        if suffix == "%" {
            return value.formattedPct
        }
        return "\(value.formattedCompact)\(suffix)"
    }
}

private struct ThresholdBreachRow: View {
    let breach: ThresholdBreach

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: breach.tone.systemImage)
                .font(.caption.weight(.black))
                .foregroundColor(breach.tone.color)
                .frame(width: 18, height: 18)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 3) {
                Text(breach.title)
                    .font(.caption.weight(.heavy))
                    .foregroundColor(AppColor.ink)
                Text(breach.detail)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(AppColor.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MetricTile: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3.weight(.bold))
                .foregroundColor(AppColor.green)
            Text(value)
                .font(.system(size: 30, weight: .black, design: .rounded))
                .foregroundColor(AppColor.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(title)
                .font(.caption.weight(.heavy))
                .foregroundColor(AppColor.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(AppColor.surface)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppColor.line, lineWidth: 1)
        )
    }
}

private struct NativePanel<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.headline.weight(.heavy))
                    .foregroundColor(AppColor.ink)
                Spacer()
                Text(subtitle)
                    .font(.caption.weight(.bold))
                    .foregroundColor(AppColor.muted)
                    .lineLimit(1)
            }
            content
        }
        .padding(14)
        .background(AppColor.surface)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppColor.line, lineWidth: 1)
        )
    }
}

private struct BarMetric: View {
    let title: String
    let value: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(title)
                    .font(.caption.weight(.heavy))
                    .foregroundColor(AppColor.muted)
                Spacer()
                Text(value.formattedPct)
                    .font(.caption.monospacedDigit().weight(.black))
                    .foregroundColor(AppColor.ink)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(AppColor.track)
                    Capsule()
                        .fill(color)
                        .frame(width: max(8, proxy.size.width * value.clampedPct / 100))
                }
            }
            .frame(height: 9)
        }
    }
}

private struct SignalRow: View {
    let signal: OperatorSignal

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: signal.tone.systemImage)
                .font(.caption.weight(.black))
                .foregroundColor(signal.tone.color)
                .frame(width: 18, height: 18)
            VStack(alignment: .leading, spacing: 3) {
                Text(signal.title)
                    .font(.subheadline.weight(.heavy))
                    .foregroundColor(AppColor.ink)
                Text(signal.detail)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(AppColor.muted)
            }
            Spacer(minLength: 0)
        }
    }
}

private struct FeedBadge: View {
    let label: String
    let tone: FeedTone

    var body: some View {
        Text(label)
            .font(.caption.weight(.black))
            .foregroundColor(tone.foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(tone.background)
            .cornerRadius(8)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

private struct SectionHeader: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .lastTextBaseline) {
            Text(title)
                .font(.title2.weight(.black))
                .foregroundColor(AppColor.ink)
            Spacer()
            Text(detail)
                .font(.caption.weight(.bold))
                .foregroundColor(AppColor.muted)
                .lineLimit(1)
        }
    }
}

private struct FlowLayout: View {
    let items: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 112), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.caption.weight(.bold))
                    .foregroundColor(AppColor.ink)
                    .lineLimit(1)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity)
                    .background(AppColor.chip)
                    .cornerRadius(7)
            }
        }
    }
}

private struct HealthGauge: View {
    let value: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(AppColor.track, lineWidth: 10)
            Circle()
                .trim(from: 0, to: value.clampedPct / 100)
                .stroke(gaugeColor, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(value.formattedPct)
                    .font(.headline.monospacedDigit().weight(.black))
                    .foregroundColor(AppColor.ink)
                Text("health")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(AppColor.muted)
            }
        }
    }

    private var gaugeColor: Color {
        if value < 60 { return AppColor.red }
        if value < 80 { return AppColor.amber }
        return AppColor.green
    }
}

private struct SparklinePanel: View {
    let title: String
    let value: String
    let values: [Double]
    let color: Color

    var body: some View {
        NativePanel(title: title, subtitle: value) {
            TrendSparkline(values: values, color: color)
                .frame(height: 82)
        }
    }
}

private struct TrendSparkline: View {
    let values: [Double]
    let color: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                RoundedRectangle(cornerRadius: 7)
                    .fill(AppColor.track.opacity(0.72))
                Path { path in
                    let points = normalizedPoints(in: proxy.size)
                    guard let first = points.first else { return }
                    path.move(to: first)
                    for point in points.dropFirst() {
                        path.addLine(to: point)
                    }
                }
                .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            }
        }
    }

    private func normalizedPoints(in size: CGSize) -> [CGPoint] {
        guard !values.isEmpty else { return [] }
        if values.count == 1 {
            return [CGPoint(x: size.width / 2, y: size.height * (1 - values[0].clampedPct / 100))]
        }

        let minValue = values.min() ?? 0
        let maxValue = values.max() ?? 100
        let spread = max(maxValue - minValue, 1)
        return values.enumerated().map { index, value in
            let x = size.width * CGFloat(index) / CGFloat(values.count - 1)
            let normalized = (value - minValue) / spread
            let y = size.height - (size.height * CGFloat(normalized))
            return CGPoint(x: x, y: min(max(y, 5), size.height - 5))
        }
    }
}

private struct MiniMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.caption.monospacedDigit().weight(.black))
                .foregroundColor(AppColor.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(title)
                .font(.caption2.weight(.heavy))
                .foregroundColor(AppColor.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(AppColor.chip)
        .cornerRadius(7)
    }
}

private struct DetailMetric: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.bold))
                .foregroundColor(AppColor.green)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.subheadline.monospacedDigit().weight(.black))
                    .foregroundColor(AppColor.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Text(title)
                    .font(.caption2.weight(.heavy))
                    .foregroundColor(AppColor.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(AppColor.chip)
        .cornerRadius(7)
    }
}

private struct StatusPill: View {
    let label: String
    let tone: SignalTone

    var body: some View {
        Label(label, systemImage: tone.systemImage)
            .font(.caption.weight(.black))
            .foregroundColor(tone.color)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(tone.background)
            .cornerRadius(7)
    }
}

private struct IconTextButton: View {
    let title: String
    let systemImage: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.black))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity)
                .background(color)
                .cornerRadius(7)
        }
    }
}

private struct OpsStateRow: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundColor(AppColor.green)
                .frame(width: 18)
                .padding(.top, 2)
            Text(title)
                .font(.caption.weight(.heavy))
                .foregroundColor(AppColor.muted)
                .frame(width: 92, alignment: .leading)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundColor(AppColor.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private enum AppColor {
    static let background = Color(red: 0.93, green: 0.96, blue: 0.96)
    static let surface = Color.white
    static let header = Color(red: 0.08, green: 0.13, blue: 0.15)
    static let headerButton = Color.white.opacity(0.14)
    static let headerMuted = Color(red: 0.72, green: 0.78, blue: 0.80)
    static let ink = Color(red: 0.08, green: 0.12, blue: 0.15)
    static let muted = Color(red: 0.39, green: 0.47, blue: 0.51)
    static let line = Color(red: 0.82, green: 0.87, blue: 0.88)
    static let track = Color(red: 0.88, green: 0.92, blue: 0.93)
    static let chip = Color(red: 0.93, green: 0.97, blue: 0.96)
    static let cyan = Color(red: 0.19, green: 0.86, blue: 0.98)
    static let green = Color(red: 0.00, green: 0.56, blue: 0.45)
    static let blue = Color(red: 0.14, green: 0.37, blue: 0.57)
    static let violet = Color(red: 0.39, green: 0.34, blue: 0.66)
    static let amber = Color(red: 0.61, green: 0.41, blue: 0.08)
    static let red = Color(red: 0.72, green: 0.30, blue: 0.24)
    static let avatar = Color(red: 0.75, green: 0.96, blue: 0.91)
}

private extension DashboardPage {
    var systemImage: String {
        switch self {
        case .cockpit:
            return "rectangle.grid.2x2.fill"
        case .hosts:
            return "server.rack"
        case .trends:
            return "waveform.path.ecg"
        case .signals:
            return "exclamationmark.triangle.fill"
        case .notifications:
            return "bell.badge.fill"
        case .report:
            return "doc.text.fill"
        case .ops:
            return "slider.horizontal.3"
        }
    }
}

private extension UNAuthorizationStatus {
    var displayLabel: String {
        switch self {
        case .authorized:
            return "Allowed"
        case .provisional:
            return "Provisional"
        case .ephemeral:
            return "Session only"
        case .denied:
            return "Denied"
        case .notDetermined:
            return "Not asked"
        @unknown default:
            return "Unknown"
        }
    }
}

private extension FeedTone {
    var foreground: Color {
        switch self {
        case .live, .local:
            return AppColor.green
        case .warning:
            return AppColor.amber
        case .loading:
            return AppColor.blue
        }
    }

    var background: Color {
        switch self {
        case .live, .local:
            return Color(red: 0.87, green: 0.97, blue: 0.94)
        case .warning:
            return Color(red: 0.98, green: 0.93, blue: 0.80)
        case .loading:
            return Color(red: 0.86, green: 0.93, blue: 0.98)
        }
    }
}

private extension SignalTone {
    var label: String {
        switch self {
        case .good:
            return "Good"
        case .watch:
            return "Watch"
        case .poor:
            return "Action"
        }
    }

    var color: Color {
        switch self {
        case .good:
            return AppColor.green
        case .watch:
            return AppColor.amber
        case .poor:
            return AppColor.red
        }
    }

    var background: Color {
        switch self {
        case .good:
            return Color(red: 0.87, green: 0.97, blue: 0.94)
        case .watch:
            return Color(red: 0.98, green: 0.93, blue: 0.80)
        case .poor:
            return Color(red: 0.98, green: 0.88, blue: 0.86)
        }
    }

    var systemImage: String {
        switch self {
        case .good:
            return "checkmark.seal.fill"
        case .watch:
            return "clock.badge.exclamationmark.fill"
        case .poor:
            return "exclamationmark.triangle.fill"
        }
    }
}
