package com.turbalance.analytics;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Space;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

public class MainActivity extends Activity {
    private static final String DEFAULT_ENDPOINT = "http://192.168.10.103:8000/build/demo/live-machine-bundle.json";
    private static final String PREFS = "turbalance_android";
    private static final String KEY_ENDPOINT = "liveBundleEndpoint";
    private static final String KEY_AUTO_REFRESH = "autoRefresh";
    private static final String KEY_CACHED_BUNDLE = "cachedBundle";
    private static final String KEY_PROFILE_NAME = "profileName";
    private static final String KEY_PROFILE_IMAGE_URI = "profileImageUri";
    private static final String KEY_ALERTS_ENABLED = "alertsEnabled";
    private static final String KEY_CPU = "thresholdCpu";
    private static final String KEY_GPU = "thresholdGpu";
    private static final String KEY_MEMORY = "thresholdMemory";
    private static final String KEY_DISK = "thresholdDisk";
    private static final String KEY_HEALTH = "thresholdHealth";
    private static final String KEY_QUEUE = "thresholdQueue";
    private static final String KEY_NETWORK = "thresholdNetwork";
    private static final String KEY_COOLDOWN = "thresholdCooldown";
    private static final String NOTIFICATION_CHANNEL_ID = "turbalance_thresholds";
    private static final int REQUEST_PICK_PHOTO = 2001;
    private static final int REQUEST_NOTIFICATIONS = 2002;
    private static final int REQUEST_SCAN_QR = 2003;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<HistoryPoint> history = new ArrayList<>();
    private final Map<String, Long> lastNotificationTimes = new HashMap<>();

    private SharedPreferences prefs;
    private LinearLayout root;
    private LinearLayout header;
    private LinearLayout tabRow;
    private LinearLayout content;
    private TextView profileNameView;
    private TextView profileDetailView;
    private TextView feedBadgeView;
    private ImageView avatarImageView;
    private TextView avatarInitialsView;
    private TextView refreshButtonView;
    private Button selectedTabButton;

    private Snapshot snapshot = Snapshot.demo();
    private ThresholdSettings thresholds = new ThresholdSettings();
    private String selectedPage = "Cockpit";
    private String endpoint = DEFAULT_ENDPOINT;
    private String feedLabel = "Loaded locally";
    private int feedTone = Tone.WATCH;
    private boolean autoRefresh = true;
    private boolean isRefreshing = false;
    private Date lastUpdated = null;
    private String lastError = "";
    private String lastNotificationSummary = "No threshold notifications sent yet.";

    private final Runnable autoRefreshRunnable = new Runnable() {
        @Override
        public void run() {
            if (autoRefresh) {
                refresh(true);
                handler.postDelayed(this, 30000);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(C.HEADER);
        window.setNavigationBarColor(C.BACKGROUND);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        endpoint = prefs.getString(KEY_ENDPOINT, DEFAULT_ENDPOINT);
        autoRefresh = prefs.getBoolean(KEY_AUTO_REFRESH, true);
        thresholds = ThresholdSettings.load(prefs);
        createNotificationChannel();
        recordSnapshot(snapshot);
        buildLayout();
        render();
        refresh(true);
        configureAutoRefresh();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(autoRefreshRunnable);
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_PHOTO && resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            final int flags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            try {
                getContentResolver().takePersistableUriPermission(uri, flags);
            } catch (RuntimeException ignored) {
                // Some gallery providers grant temporary read access only.
            }
            prefs.edit().putString(KEY_PROFILE_IMAGE_URI, uri.toString()).apply();
            renderHeader();
        } else if (requestCode == REQUEST_SCAN_QR && resultCode == RESULT_OK && data != null) {
            String payload = data.getStringExtra("SCAN_RESULT");
            if (payload == null) payload = data.getDataString();
            applyPairingPayload(payload);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_NOTIFICATIONS) {
            if (hasNotificationPermission()) {
                lastNotificationSummary = "Notifications are ready. Alerts will fire when thresholds are crossed.";
                evaluateThresholds(snapshot);
            } else {
                lastNotificationSummary = "Notification permission was not granted on this Android phone.";
            }
            render();
        }
    }

    private void buildLayout() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(C.BACKGROUND);
        root.setLayoutParams(new LinearLayout.LayoutParams(-1, -1));

        header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(18), dp(16), dp(18), dp(14));
        header.setBackgroundColor(C.HEADER);
        root.addView(header, new LinearLayout.LayoutParams(-1, -2));

        HorizontalScrollView tabsScroll = new HorizontalScrollView(this);
        tabsScroll.setHorizontalScrollBarEnabled(false);
        tabsScroll.setBackgroundColor(C.BACKGROUND);
        tabRow = new LinearLayout(this);
        tabRow.setOrientation(LinearLayout.HORIZONTAL);
        tabRow.setPadding(dp(10), dp(10), dp(10), dp(8));
        tabsScroll.addView(tabRow, new HorizontalScrollView.LayoutParams(-2, -2));
        root.addView(tabsScroll, new LinearLayout.LayoutParams(-1, -2));

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(false);
        scrollView.setBackgroundColor(C.BACKGROUND);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(4), dp(16), dp(28));
        scrollView.addView(content, new ScrollView.LayoutParams(-1, -2));
        root.addView(scrollView, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private void render() {
        renderHeader();
        renderTabs();
        content.removeAllViews();
        if ("Cockpit".equals(selectedPage)) {
            renderCockpit();
        } else if ("Hosts".equals(selectedPage)) {
            renderHosts();
        } else if ("Topology".equals(selectedPage)) {
            renderTopology();
        } else if ("Trends".equals(selectedPage)) {
            renderTrends();
        } else if ("Signals".equals(selectedPage)) {
            renderSignals();
        } else if ("Alerts".equals(selectedPage)) {
            renderAlerts();
        } else if ("Report".equals(selectedPage)) {
            renderReport();
        } else {
            renderOps();
        }
    }

    private void renderHeader() {
        header.removeAllViews();

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setOrientation(LinearLayout.HORIZONTAL);

        LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.VERTICAL);
        ImageView wordmark = new ImageView(this);
        Bitmap bitmap = loadAssetBitmap("public/assets/turbalance-wordmark-special-t.png");
        if (bitmap != null) {
            wordmark.setImageBitmap(bitmap);
            wordmark.setColorFilter(Color.WHITE);
            wordmark.setScaleType(ImageView.ScaleType.FIT_START);
            brand.addView(wordmark, new LinearLayout.LayoutParams(dp(220), dp(38)));
        } else {
            brand.addView(text("turbalance", 30, Color.WHITE, Typeface.BOLD));
        }
        TextView analytics = text("Analytics", 15, C.CYAN, Typeface.BOLD);
        brand.addView(analytics);
        top.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));

        TextView pause = headerButton(autoRefresh ? "Pause" : "Resume");
        pause.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                autoRefresh = !autoRefresh;
                prefs.edit().putBoolean(KEY_AUTO_REFRESH, autoRefresh).apply();
                configureAutoRefresh();
                render();
            }
        });
        top.addView(pause);
        addGap(top, 8, true);

        refreshButtonView = headerButton(isRefreshing ? "Refreshing" : "Refresh");
        refreshButtonView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                refresh(false);
            }
        });
        top.addView(refreshButtonView);
        header.addView(top, new LinearLayout.LayoutParams(-1, -2));

        addGap(header, 14, false);

        LinearLayout profileRow = new LinearLayout(this);
        profileRow.setGravity(Gravity.CENTER_VERTICAL);
        profileRow.setOrientation(LinearLayout.HORIZONTAL);
        profileRow.setClickable(true);
        profileRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showProfileDialog();
            }
        });

        FrameLayout avatar = new FrameLayout(this);
        avatar.setBackground(circle(C.TRACK, C.BORDER));
        avatarImageView = new ImageView(this);
        avatarImageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        avatarInitialsView = text(profileInitials(), 15, Color.WHITE, Typeface.BOLD);
        avatarInitialsView.setGravity(Gravity.CENTER);
        avatar.addView(avatarImageView, new FrameLayout.LayoutParams(-1, -1));
        avatar.addView(avatarInitialsView, new FrameLayout.LayoutParams(-1, -1));
        loadAvatarImage();
        profileRow.addView(avatar, new LinearLayout.LayoutParams(dp(48), dp(48)));
        addGap(profileRow, 12, true);

        LinearLayout profileText = new LinearLayout(this);
        profileText.setOrientation(LinearLayout.VERTICAL);
        profileNameView = text(profileName(), 21, Color.WHITE, Typeface.BOLD);
        profileNameView.setSingleLine(true);
        profileDetailView = text(profileDetail() + " | " + freshnessText(), 13, C.MUTED, Typeface.BOLD);
        profileDetailView.setSingleLine(true);
        profileText.addView(profileNameView);
        profileText.addView(profileDetailView);
        profileRow.addView(profileText, new LinearLayout.LayoutParams(0, -2, 1));

        feedBadgeView = text(feedLabel, 12, Color.WHITE, Typeface.BOLD);
        feedBadgeView.setGravity(Gravity.CENTER);
        feedBadgeView.setPadding(dp(10), dp(6), dp(10), dp(6));
        feedBadgeView.setBackground(rounded(feedTone == Tone.GOOD ? C.GREEN_DARK : feedTone == Tone.POOR ? C.RED_DARK : C.AMBER_DARK, C.BORDER, 8));
        profileRow.addView(feedBadgeView);
        header.addView(profileRow, new LinearLayout.LayoutParams(-1, -2));
    }

    private void renderTabs() {
        tabRow.removeAllViews();
        selectedTabButton = null;
        String[] pages = {"Cockpit", "Hosts", "Topology", "Trends", "Signals", "Alerts", "Report", "Ops"};
        for (final String page : pages) {
            Button button = new Button(this);
            button.setAllCaps(false);
            button.setText(page);
            button.setTextSize(13);
            button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            button.setMinHeight(0);
            button.setMinimumHeight(0);
            button.setPadding(dp(12), dp(8), dp(12), dp(8));
            button.setTextColor(page.equals(selectedPage) ? Color.WHITE : C.MUTED);
            button.setBackground(rounded(page.equals(selectedPage) ? C.BLUE : C.PANEL, C.BORDER, 7));
            button.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectedPage = page;
                    render();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, dp(42));
            lp.setMargins(0, 0, dp(8), 0);
            tabRow.addView(button, lp);
            if (page.equals(selectedPage)) selectedTabButton = button;
        }
    }

    private void renderCockpit() {
        section("Cockpit", snapshot.sourceLabel + " | " + snapshot.freshnessLabel());
        LinearLayout row1 = horizontal();
        row1.addView(metricTile("Hosts", String.valueOf(snapshot.summary.hostCount), snapshot.summary.actionCount + " action | " + snapshot.summary.watchCount + " watch", Tone.GOOD), weightLp());
        addGap(row1, 10, true);
        row1.addView(metricTile("Health", pct(snapshot.summary.averageHealthScore), "fleet average", toneForHealth(snapshot.summary.averageHealthScore)), weightLp());
        content.addView(row1);
        addGap(content, 10, false);

        LinearLayout row2 = horizontal();
        row2.addView(metricTile("GPU", pct(snapshot.summary.averageGpuPct), snapshot.summary.gpuCount + " GPU host capacity", toneForUtil(snapshot.summary.averageGpuPct)), weightLp());
        addGap(row2, 10, true);
        row2.addView(metricTile("CPU", pct(snapshot.summary.averageCpuPct), "host activity", toneForUtil(snapshot.summary.averageCpuPct)), weightLp());
        content.addView(row2);
        addGap(content, 10, false);

        LinearLayout row3 = horizontal();
        row3.addView(metricTile("Memory", pct(snapshot.summary.averageMemoryPct), "average pressure", pressureTone(snapshot.summary.averageMemoryPct)), weightLp());
        addGap(row3, 10, true);
        row3.addView(metricTile("Network", compact(snapshot.summary.totalNetworkMBps) + " MB/s", "aggregate throughput", Tone.WATCH), weightLp());
        content.addView(row3);
        addGap(content, 12, false);

        LinearLayout signals = panel("Current signals", snapshot.signals.size() + " active");
        for (Signal signal : snapshot.signals) {
            signals.addView(signalRow(signal));
        }
        content.addView(signals);
    }

    private void renderHosts() {
        section("Hosts", snapshot.hosts.size() + " observed rows");
        List<Host> sorted = new ArrayList<>(snapshot.hosts);
        Collections.sort(sorted, new Comparator<Host>() {
            @Override
            public int compare(Host a, Host b) {
                int risk = b.customerRiskPriority() - a.customerRiskPriority();
                if (risk != 0) return risk;
                return Double.compare(a.hardwareHealthScore, b.hardwareHealthScore);
            }
        });
        if (sorted.isEmpty()) {
            content.addView(emptyPanel("No host telemetry rows were available in this bundle."));
            return;
        }
        for (final Host host : sorted) {
            LinearLayout card = panel(host.name, host.role);
            LinearLayout titleRow = horizontal();
            titleRow.setGravity(Gravity.CENTER_VERTICAL);
            titleRow.addView(text(host.status, 13, C.MUTED, Typeface.BOLD), weightLp());
            titleRow.addView(pill(host.riskLabel(), host.riskTone()));
            card.addView(titleRow);
            card.addView(metricBar("Health", host.hardwareHealthScore, toneForHealth(host.hardwareHealthScore)));
            card.addView(metricBar("CPU", host.cpuPct, pressureTone(host.cpuPct)));
            card.addView(metricBar("GPU", host.gpuPct, toneForUtil(host.gpuPct)));
            card.addView(metricBar("Memory", host.memoryPct, pressureTone(host.memoryPct)));
            card.addView(metricBar("Disk", host.diskPct, pressureTone(host.diskPct)));
            card.addView(text(host.primaryAction(), 13, C.TEXT, Typeface.BOLD));
            if (!host.warnings.isEmpty()) {
                card.addView(text(join(host.warnings, " | "), 12, C.AMBER, Typeface.BOLD));
            }
            card.setClickable(true);
            card.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showHostDialog(host);
                }
            });
            addCard(card);
        }
    }

    private void renderTopology() {
        section("Topology", snapshot.hosts.size() + " mapped hosts");
        if (snapshot.hosts.isEmpty()) {
            content.addView(emptyPanel("Waiting for live fleet host rows before drawing topology."));
            return;
        }

        LinearLayout map = panel("Fleet map", snapshot.freshnessLabel());
        map.addView(new TopologyCanvasView(this, snapshot.hosts), new LinearLayout.LayoutParams(-1, dp(360)));
        content.addView(map);
        addGap(content, 12, false);

        LinearLayout posture = panel("Topology posture", snapshot.observedHost);
        LinearLayout row1 = horizontal();
        row1.addView(metricTile("Healthy", String.valueOf(Math.max(0, snapshot.summary.hostCount - snapshot.summary.actionCount - snapshot.summary.watchCount)), "clean nodes", Tone.GOOD), weightLp());
        addGap(row1, 10, true);
        row1.addView(metricTile("Watch", String.valueOf(snapshot.summary.watchCount), "needs review", snapshot.summary.watchCount > 0 ? Tone.WATCH : Tone.GOOD), weightLp());
        posture.addView(row1);
        addGap(posture, 10, false);
        LinearLayout row2 = horizontal();
        row2.addView(metricTile("Action", String.valueOf(snapshot.summary.actionCount), "repair first", snapshot.summary.actionCount > 0 ? Tone.POOR : Tone.GOOD), weightLp());
        addGap(row2, 10, true);
        row2.addView(metricTile("Network", compact(snapshot.summary.totalNetworkMBps) + " MB/s", "aggregate throughput", Tone.WATCH), weightLp());
        posture.addView(row2);
        content.addView(posture);
        addGap(content, 12, false);

        List<String> services = topologyServiceTags(snapshot.hosts);
        LinearLayout servicePanel = panel("Service groups", services.size() + " observed");
        servicePanel.addView(text(services.isEmpty() ? "live-machine" : join(services, " | "), 13, C.TEXT, Typeface.BOLD));
        content.addView(servicePanel);
    }

    private void renderTrends() {
        section("Trends", history.size() + " retained samples");
        LinearLayout latest = panel("Latest posture", snapshot.freshnessLabel());
        latest.addView(metricBar("GPU", snapshot.summary.averageGpuPct, toneForUtil(snapshot.summary.averageGpuPct)));
        latest.addView(metricBar("CPU", snapshot.summary.averageCpuPct, pressureTone(snapshot.summary.averageCpuPct)));
        latest.addView(metricBar("Memory", snapshot.summary.averageMemoryPct, pressureTone(snapshot.summary.averageMemoryPct)));
        latest.addView(metricBar("Health", snapshot.summary.averageHealthScore, toneForHealth(snapshot.summary.averageHealthScore)));
        content.addView(latest);
        addGap(content, 12, false);

        LinearLayout historyPanel = panel("History", "last " + Math.min(history.size(), 12) + " samples");
        int start = Math.max(0, history.size() - 12);
        for (int i = start; i < history.size(); i++) {
            HistoryPoint point = history.get(i);
            LinearLayout row = horizontal();
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.addView(text(point.label, 12, C.MUTED, Typeface.BOLD), new LinearLayout.LayoutParams(dp(50), -2));
            row.addView(text("GPU " + pct(point.gpu) + " | CPU " + pct(point.cpu) + " | Mem " + pct(point.memory) + " | Health " + pct(point.health), 12, C.TEXT, Typeface.BOLD), weightLp());
            historyPanel.addView(row);
            if (i < history.size() - 1) addDivider(historyPanel);
        }
        content.addView(historyPanel);
    }

    private void renderSignals() {
        section("Signals", "interpreted from live telemetry");
        for (Signal signal : snapshot.signals) {
            LinearLayout card = panel(signal.title, signal.tone == Tone.POOR ? "action" : signal.tone == Tone.WATCH ? "watch" : "healthy");
            card.addView(text(signal.detail, 14, C.TEXT, Typeface.NORMAL));
            addCard(card);
        }
    }

    private void renderAlerts() {
        section("Alerts", "local Android threshold notifications");
        LinearLayout controls = panel("Notification thresholds", lastNotificationSummary);
        Switch enabled = new Switch(this);
        enabled.setText("Enable threshold alerts");
        enabled.setTextColor(Color.WHITE);
        enabled.setTextSize(15);
        enabled.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        enabled.setChecked(thresholds.enabled);
        enabled.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                thresholds.enabled = isChecked;
                thresholds.save(prefs);
                if (isChecked) {
                    requestNotificationPermissionIfNeeded();
                    evaluateThresholds(snapshot);
                } else {
                    lastNotificationSummary = "Threshold notifications are paused.";
                }
                render();
            }
        });
        controls.addView(enabled);
        controls.addView(thresholdSlider("CPU", thresholds.cpuPct, 0, 100, "%", new ThresholdSetter() {
            @Override public void set(double value) { thresholds.cpuPct = value; }
        }));
        controls.addView(thresholdSlider("GPU", thresholds.gpuPct, 0, 100, "%", new ThresholdSetter() {
            @Override public void set(double value) { thresholds.gpuPct = value; }
        }));
        controls.addView(thresholdSlider("Memory", thresholds.memoryPct, 0, 100, "%", new ThresholdSetter() {
            @Override public void set(double value) { thresholds.memoryPct = value; }
        }));
        controls.addView(thresholdSlider("Disk", thresholds.diskPct, 0, 100, "%", new ThresholdSetter() {
            @Override public void set(double value) { thresholds.diskPct = value; }
        }));
        controls.addView(thresholdSlider("Health below", thresholds.healthScore, 0, 100, "%", new ThresholdSetter() {
            @Override public void set(double value) { thresholds.healthScore = value; }
        }));
        controls.addView(thresholdSlider("Queue", thresholds.queueMinutes, 0, 60, " min", new ThresholdSetter() {
            @Override public void set(double value) { thresholds.queueMinutes = value; }
        }));
        controls.addView(thresholdSlider("Network", thresholds.networkMBps, 0, 1000, " MB/s", new ThresholdSetter() {
            @Override public void set(double value) { thresholds.networkMBps = value; }
        }));
        Button test = actionButton("Send test notification");
        test.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                requestNotificationPermissionIfNeeded();
                if (thresholds.enabled && hasNotificationPermission()) {
                    sendNotification("test-" + System.currentTimeMillis(), "turbalance alert test", "Threshold notifications are working on this Android phone.");
                    lastNotificationSummary = "Test notification sent.";
                } else {
                    lastNotificationSummary = "Enable notifications and allow permission before sending a test.";
                }
                render();
            }
        });
        controls.addView(test);
        content.addView(controls);
        addGap(content, 12, false);

        LinearLayout breachesPanel = panel("Current breaches", "evaluated locally");
        List<Breach> breaches = thresholds.breaches(snapshot);
        if (breaches.isEmpty()) {
            breachesPanel.addView(text("No configured thresholds are currently breached.", 13, C.MUTED, Typeface.BOLD));
        } else {
            for (Breach breach : breaches) {
                breachesPanel.addView(signalRow(new Signal(breach.id, breach.title, breach.detail, breach.tone)));
            }
        }
        content.addView(breachesPanel);
    }

    private void renderReport() {
        section("Report", snapshot.sourceLabel);
        LinearLayout posture = panel("Customer posture", snapshot.freshnessLabel());
        posture.addView(metricTile("Posture", snapshot.customerPosture(), snapshot.summary.actionCount + " action | " + snapshot.summary.watchCount + " watch", snapshot.summary.actionCount > 0 ? Tone.POOR : snapshot.summary.watchCount > 0 ? Tone.WATCH : Tone.GOOD));
        posture.addView(metricBar("Average health", snapshot.summary.averageHealthScore, toneForHealth(snapshot.summary.averageHealthScore)));
        content.addView(posture);
        addGap(content, 12, false);

        LinearLayout report = panel("Report text", "copy-ready");
        Button copy = actionButton("Copy report");
        copy.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("turbalance customer report", snapshot.customerReportText()));
                Toast.makeText(MainActivity.this, "Report copied", Toast.LENGTH_SHORT).show();
            }
        });
        report.addView(copy);
        TextView body = text(snapshot.customerReportText(), 12, C.TEXT, Typeface.NORMAL);
        body.setLineSpacing(0, 1.1f);
        body.setTypeface(Typeface.MONOSPACE);
        report.addView(body);
        content.addView(report);
    }

    private void renderOps() {
        section("Ops", "live bundle and runtime controls");
        LinearLayout endpointPanel = panel("Live endpoint", endpoint);
        final EditText endpointEdit = new EditText(this);
        endpointEdit.setSingleLine(false);
        endpointEdit.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        endpointEdit.setText(endpoint);
        endpointEdit.setTextColor(Color.WHITE);
        endpointEdit.setHintTextColor(C.MUTED);
        endpointEdit.setTextSize(13);
        endpointEdit.setBackground(rounded(C.TRACK, C.BORDER, 7));
        endpointEdit.setPadding(dp(10), dp(8), dp(10), dp(8));
        endpointPanel.addView(endpointEdit, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout endpointButtons = horizontal();
        Button save = actionButton("Save endpoint");
        save.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                endpoint = endpointEdit.getText().toString().trim();
                prefs.edit().putString(KEY_ENDPOINT, endpoint).apply();
                refresh(false);
            }
        });
        endpointButtons.addView(save, weightLp());
        addGap(endpointButtons, 10, true);
        Button reset = actionButton("Reset");
        reset.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                endpoint = DEFAULT_ENDPOINT;
                prefs.edit().putString(KEY_ENDPOINT, endpoint).apply();
                refresh(false);
            }
        });
        endpointButtons.addView(reset, weightLp());
        endpointPanel.addView(endpointButtons);
        LinearLayout pairingButtons = horizontal();
        Button scan = actionButton("Scan QR");
        scan.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startQrScan();
            }
        });
        pairingButtons.addView(scan, weightLp());
        addGap(pairingButtons, 10, true);
        Button paste = actionButton("Paste pairing");
        paste.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPairingPayloadDialog();
            }
        });
        pairingButtons.addView(paste, weightLp());
        LinearLayout.LayoutParams pairingLp = new LinearLayout.LayoutParams(-1, -2);
        pairingLp.setMargins(0, dp(10), 0, 0);
        endpointPanel.addView(pairingButtons, pairingLp);
        content.addView(endpointPanel);
        addGap(content, 12, false);

        LinearLayout state = panel("Runtime state", feedLabel);
        state.addView(stateRow("Generated", snapshot.generatedAt));
        state.addView(stateRow("Observed host", snapshot.observedHost));
        state.addView(stateRow("Imported", snapshot.importedSources.isEmpty() ? "none" : join(snapshot.importedSources, ", ")));
        state.addView(stateRow("Auto refresh", autoRefresh ? "on" : "off"));
        state.addView(stateRow("Last error", lastError.isEmpty() ? "none" : lastError));
        if (!snapshot.hosts.isEmpty()) {
            Host first = snapshot.hosts.get(0);
            state.addView(stateRow("Network", first.networkInterface + " " + first.networkLocalAddress + " " + compact(first.networkLinkSpeedMbps) + " Mbps"));
            state.addView(stateRow("NCCL", first.ncclRuntimeStatus.isEmpty() ? "n/a" : first.ncclRuntimeStatus));
        }
        content.addView(state);
    }

    private void startQrScan() {
        Intent intent = new Intent("com.google.zxing.client.android.SCAN");
        intent.putExtra("SCAN_MODE", "QR_CODE_MODE");
        try {
            startActivityForResult(intent, REQUEST_SCAN_QR);
        } catch (ActivityNotFoundException error) {
            showPairingPayloadDialog();
        }
    }

    private void showPairingPayloadDialog() {
        final EditText input = new EditText(this);
        input.setSingleLine(false);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(C.MUTED);
        input.setHint("http://192.168.10.103:8000/build/demo/live-machine-bundle.json");
        input.setBackground(rounded(C.TRACK, C.BORDER, 7));
        input.setPadding(dp(10), dp(8), dp(10), dp(8));

        new AlertDialog.Builder(this)
            .setTitle("Pairing payload")
            .setView(input)
            .setPositiveButton("Connect", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    applyPairingPayload(input.getText().toString());
                }
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void applyPairingPayload(String payload) {
        String url = endpointUrlFromPairingPayload(payload);
        if (url == null || url.trim().isEmpty()) {
            Toast.makeText(this, "Pairing payload did not include a valid bundle URL", Toast.LENGTH_LONG).show();
            return;
        }

        endpoint = url.trim();
        prefs.edit().putString(KEY_ENDPOINT, endpoint).apply();
        Toast.makeText(this, "Connected to " + endpointHostLabel(endpoint), Toast.LENGTH_SHORT).show();
        render();
        refresh(false);
    }

    private String endpointUrlFromPairingPayload(String payload) {
        if (payload == null) return null;
        String trimmed = payload.trim();
        if (trimmed.isEmpty()) return null;

        if (trimmed.startsWith("{")) {
            try {
                JSONObject object = new JSONObject(trimmed);
                String[] keys = {"bundleUrl", "url", "endpoint", "bundle"};
                for (String key : keys) {
                    String value = object.optString(key, "");
                    if (isValidEndpointUrl(value)) return value.trim();
                }
            } catch (JSONException ignored) {
            }
        }

        try {
            Uri uri = Uri.parse(trimmed);
            if ("turbalance".equalsIgnoreCase(uri.getScheme())) {
                String[] keys = {"bundle", "bundleUrl", "url", "endpoint"};
                for (String key : keys) {
                    String value = uri.getQueryParameter(key);
                    if (isValidEndpointUrl(value)) return value.trim();
                }
            }
        } catch (Exception ignored) {
        }

        return isValidEndpointUrl(trimmed) ? trimmed : null;
    }

    private boolean isValidEndpointUrl(String value) {
        if (value == null) return false;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(trimmed);
            String scheme = uri.getScheme();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) && uri.getHost() != null;
        } catch (Exception error) {
            return false;
        }
    }

    private String endpointHostLabel(String value) {
        try {
            Uri uri = Uri.parse(value);
            return uri.getHost() == null ? "live bundle" : uri.getHost();
        } catch (Exception error) {
            return "live bundle";
        }
    }

    private void refresh(final boolean automatic) {
        if (isRefreshing) return;
        isRefreshing = true;
        if (!automatic) {
            feedLabel = "Refreshing";
            feedTone = Tone.WATCH;
            renderHeader();
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String body = fetch(endpoint);
                    final Snapshot next = Snapshot.fromJson(body, "Live telemetry");
                    prefs.edit().putString(KEY_CACHED_BUNDLE, body).apply();
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            snapshot = next;
                            feedLabel = next.isStale() ? "Stale live feed" : "Live";
                            feedTone = next.isStale() ? Tone.WATCH : Tone.GOOD;
                            lastUpdated = new Date();
                            lastError = "";
                            isRefreshing = false;
                            recordSnapshot(next);
                            evaluateThresholds(next);
                            render();
                        }
                    });
                } catch (final Exception error) {
                    final Snapshot fallback = cachedSnapshot();
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (fallback != null) {
                                snapshot = fallback;
                                feedLabel = automatic ? "Cached" : "Live feed unavailable";
                                feedTone = automatic ? Tone.WATCH : Tone.POOR;
                                recordSnapshot(fallback);
                                evaluateThresholds(fallback);
                            } else {
                                feedLabel = "Loaded locally";
                                feedTone = Tone.WATCH;
                            }
                            lastError = error.getMessage() == null ? error.toString() : error.getMessage();
                            isRefreshing = false;
                            render();
                        }
                    });
                }
            }
        }).start();
    }

    private String fetch(String urlText) throws IOException {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlText);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(8000);
            connection.setRequestProperty("Accept", "application/json");
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IOException("HTTP " + code);
            }
            return readAll(connection.getInputStream());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private Snapshot cachedSnapshot() {
        String cached = prefs.getString(KEY_CACHED_BUNDLE, "");
        if (cached.isEmpty()) return null;
        try {
            return Snapshot.fromJson(cached, "Cached telemetry");
        } catch (JSONException error) {
            return null;
        }
    }

    private void configureAutoRefresh() {
        handler.removeCallbacks(autoRefreshRunnable);
        if (autoRefresh) {
            handler.postDelayed(autoRefreshRunnable, 30000);
        }
    }

    private void recordSnapshot(Snapshot next) {
        history.add(new HistoryPoint(next));
        while (history.size() > 48) history.remove(0);
    }

    private void evaluateThresholds(Snapshot current) {
        if (!thresholds.enabled || !hasNotificationPermission()) return;
        List<Breach> breaches = thresholds.breaches(current);
        if (breaches.isEmpty()) {
            lastNotificationSummary = "No configured thresholds are currently breached.";
            return;
        }
        long now = System.currentTimeMillis();
        long cooldownMs = (long) (thresholds.cooldownMinutes * 60_000);
        int sent = 0;
        for (int i = 0; i < breaches.size() && i < 3; i++) {
            Breach breach = breaches.get(i);
            long last = lastNotificationTimes.containsKey(breach.id) ? lastNotificationTimes.get(breach.id) : 0;
            if (now - last >= cooldownMs) {
                sendNotification(breach.id, breach.title, breach.detail);
                lastNotificationTimes.put(breach.id, now);
                sent++;
            }
        }
        lastNotificationSummary = sent > 0 ? "Scheduled " + sent + " threshold alert" + (sent == 1 ? "." : "s.") : "Thresholds are breached, but alerts are cooling down.";
    }

    private void sendNotification(String id, String title, String detail) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            : new Notification.Builder(this);
        builder.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(detail)
            .setStyle(new Notification.BigTextStyle().bigText(detail))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true);
        manager.notify(Math.abs(id.hashCode()), builder.build());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL_ID, "turbalance thresholds", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Local threshold notifications from turbalance Analytics.");
        manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private void showProfileDialog() {
        final EditText input = new EditText(this);
        input.setText(profileName().equals("Set your name") ? "" : profileName());
        input.setHint("Name shown in the header");
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(C.MUTED);
        input.setPadding(dp(12), dp(8), dp(12), dp(8));
        input.setBackground(rounded(C.TRACK, C.BORDER, 7));

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(18);
        box.setPadding(padding, padding, padding, 0);
        box.addView(text("Android does not expose the Google account owner name to apps. Save a local display name and optional photo for this device.", 13, C.MUTED, Typeface.BOLD));
        addGap(box, 12, false);
        box.addView(input);

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Header profile")
            .setView(box)
            .setPositiveButton("Save", null)
            .setNeutralButton("Set photo", null)
            .setNegativeButton("Cancel", null)
            .create();
        dialog.setOnShowListener(new android.content.DialogInterface.OnShowListener() {
            @Override
            public void onShow(final android.content.DialogInterface dialogInterface) {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        String name = input.getText().toString().trim();
                        if (!name.isEmpty()) {
                            prefs.edit().putString(KEY_PROFILE_NAME, name).apply();
                            renderHeader();
                        }
                        dialog.dismiss();
                    }
                });
                dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("image/*");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                        startActivityForResult(intent, REQUEST_PICK_PHOTO);
                        dialog.dismiss();
                    }
                });
            }
        });
        dialog.show();
    }

    private void showHostDialog(Host host) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(12), dp(18), dp(8));
        box.addView(stateRow("Status", host.status));
        box.addView(stateRow("Action", host.primaryAction()));
        box.addView(stateRow("Network", host.networkInterface + " " + host.networkLocalAddress + " " + compact(host.networkLinkSpeedMbps) + " Mbps"));
        box.addView(stateRow("Services", host.serviceSummary()));
        box.addView(stateRow("GPU process", emptyFallback(host.gpuProcessSummary)));
        box.addView(stateRow("Thermal", emptyFallback(host.gpuThermalSummary)));
        box.addView(stateRow("Topology", emptyFallback(host.gpuTopologySummary)));
        box.addView(stateRow("Ollama", host.ollamaStatus + " | " + compact(host.ollamaTokensPerSecond) + " tok/s | TTFT " + compact(host.ollamaTimeToFirstTokenMs) + " ms"));
        box.addView(stateRow("NCCL", emptyFallback(host.ncclRuntimeStatus + " " + host.ncclRuntimeDetail)));
        box.addView(stateRow("Clock", host.clockSynchronized ? "synchronized" : "not synchronized"));
        scroll.addView(box);
        new AlertDialog.Builder(this)
            .setTitle(host.name)
            .setView(scroll)
            .setPositiveButton("Done", null)
            .show();
    }

    private LinearLayout thresholdSlider(String label, double value, int min, int max, String suffix, final ThresholdSetter setter) {
        final LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        final TextView title = text(label + ": " + compact(value) + suffix, 12, C.TEXT, Typeface.BOLD);
        box.addView(title);
        SeekBar seek = new SeekBar(this);
        seek.setMax(max - min);
        seek.setProgress((int) Math.round(value - min));
        tintProgress(seek, C.BLUE);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                double next = min + progress;
                title.setText(label + ": " + compact(next) + suffix);
                setter.set(next);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {
                thresholds.save(prefs);
                evaluateThresholds(snapshot);
                render();
            }
        });
        box.addView(seek);
        return box;
    }

    private LinearLayout metricTile(String title, String value, String detail, int tone) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setPadding(dp(12), dp(10), dp(12), dp(10));
        tile.setBackground(rounded(C.PANEL, toneColor(tone), 8));
        tile.addView(text(title, 12, C.MUTED, Typeface.BOLD));
        tile.addView(text(value, 23, Color.WHITE, Typeface.BOLD));
        tile.addView(text(detail, 12, C.MUTED, Typeface.BOLD));
        return tile;
    }

    private LinearLayout metricBar(String label, double value, int tone) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        TextView row = text(label + " " + pct(value), 12, C.TEXT, Typeface.BOLD);
        box.addView(row);
        ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgress((int) Math.round(clamp(value, 0, 100)));
        tintProgress(bar, toneColor(tone));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(7));
        lp.setMargins(0, dp(4), 0, dp(8));
        box.addView(bar, lp);
        return box;
    }

    private LinearLayout panel(String title, String subtitle) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(12), dp(11), dp(12), dp(12));
        panel.setBackground(rounded(C.PANEL, C.BORDER, 8));
        LinearLayout row = horizontal();
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(text(title, 17, Color.WHITE, Typeface.BOLD), weightLp());
        row.addView(text(subtitle, 12, C.MUTED, Typeface.BOLD));
        panel.addView(row);
        addGap(panel, 10, false);
        return panel;
    }

    private LinearLayout emptyPanel(String message) {
        LinearLayout panel = panel("No data", "waiting");
        panel.addView(text(message, 13, C.MUTED, Typeface.BOLD));
        return panel;
    }

    private LinearLayout signalRow(Signal signal) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, dp(7), 0, dp(7));
        LinearLayout title = horizontal();
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.addView(text(signal.title, 14, Color.WHITE, Typeface.BOLD), weightLp());
        title.addView(pill(signal.tone == Tone.POOR ? "Action" : signal.tone == Tone.WATCH ? "Watch" : "Healthy", signal.tone));
        row.addView(title);
        row.addView(text(signal.detail, 12, C.MUTED, Typeface.NORMAL));
        return row;
    }

    private TextView pill(String label, int tone) {
        TextView pill = text(label, 11, Color.WHITE, Typeface.BOLD);
        pill.setGravity(Gravity.CENTER);
        pill.setPadding(dp(8), dp(4), dp(8), dp(4));
        pill.setBackground(rounded(tone == Tone.POOR ? C.RED_DARK : tone == Tone.WATCH ? C.AMBER_DARK : C.GREEN_DARK, toneColor(tone), 7));
        return pill;
    }

    private TextView stateRow(String key, String value) {
        TextView row = text(key + ": " + emptyFallback(value), 13, C.TEXT, Typeface.NORMAL);
        row.setPadding(0, dp(5), 0, dp(5));
        return row;
    }

    private void section(String title, String detail) {
        LinearLayout row = horizontal();
        row.setGravity(Gravity.BOTTOM);
        row.addView(text(title, 22, Color.WHITE, Typeface.BOLD), weightLp());
        row.addView(text(detail, 12, C.MUTED, Typeface.BOLD));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(8), 0, dp(12));
        content.addView(row, lp);
    }

    private TextView headerButton(String label) {
        TextView button = text(label, 12, Color.WHITE, Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(10), dp(8), dp(10), dp(8));
        button.setBackground(rounded(C.TRACK, C.BORDER, 8));
        button.setClickable(true);
        return button;
    }

    private Button actionButton(String label) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextSize(13);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(Color.WHITE);
        button.setBackground(rounded(C.BLUE, C.BLUE, 7));
        return button;
    }

    private TextView text(String value, int sp, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value == null ? "" : value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT, style);
        view.setIncludeFontPadding(true);
        return view;
    }

    private LinearLayout horizontal() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }

    private void addCard(View card) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, dp(12));
        content.addView(card, lp);
    }

    private void addDivider(LinearLayout parent) {
        View divider = new View(this);
        divider.setBackgroundColor(C.BORDER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 1);
        lp.setMargins(0, dp(6), 0, dp(6));
        parent.addView(divider, lp);
    }

    private void addGap(LinearLayout parent, int dpValue, boolean horizontal) {
        Space space = new Space(this);
        parent.addView(space, horizontal ? new LinearLayout.LayoutParams(dp(dpValue), 1) : new LinearLayout.LayoutParams(1, dp(dpValue)));
    }

    private LinearLayout.LayoutParams weightLp() {
        return new LinearLayout.LayoutParams(0, -2, 1);
    }

    private List<String> topologyServiceTags(List<Host> hosts) {
        Set<String> tags = new HashSet<>();
        for (Host host : hosts) {
            for (String service : host.observedServices) {
                String[] pieces = service.split(":");
                String label = pieces.length > 0 ? pieces[0].trim() : service.trim();
                if (!label.isEmpty()) tags.add(label);
            }
        }
        List<String> result = new ArrayList<>(tags);
        Collections.sort(result);
        return result;
    }

    private final class TopologyCanvasView extends View {
        private final List<Host> hosts;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rect = new RectF();

        TopologyCanvasView(Context context, List<Host> hosts) {
            super(context);
            this.hosts = new ArrayList<>(hosts);
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int width = getWidth();
            int height = getHeight();
            rect.set(dp(2), dp(2), width - dp(2), height - dp(2));
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(C.TRACK);
            canvas.drawRoundRect(rect, dp(8), dp(8), paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(1));
            paint.setColor(C.BORDER);
            canvas.drawRoundRect(rect, dp(8), dp(8), paint);

            paint.setColor(withAlpha(C.BORDER, 115));
            paint.setStrokeWidth(1);
            for (float fraction : new float[] {0.24f, 0.42f, 0.60f, 0.78f}) {
                float y = height * fraction;
                canvas.drawLine(dp(16), y, width - dp(16), y, paint);
            }

            if (hosts.isEmpty()) {
                drawCenteredText(canvas, "Waiting for fleet rows", width / 2f, height / 2f, 14, C.MUTED, Typeface.BOLD);
                return;
            }

            Map<String, List<Host>> groups = topologyGroups();
            List<String> activeGroups = new ArrayList<>();
            for (String id : topologyGroupOrder()) {
                List<Host> members = groups.get(id);
                if (members != null && !members.isEmpty()) activeGroups.add(id);
            }

            float hubX = Math.max(dp(76), width * 0.18f);
            float hubY = height * 0.52f;
            List<TopologyPlacement> placements = topologyPlacements(activeGroups, groups, width, height);
            for (TopologyPlacement placement : placements) {
                drawTopologyLink(canvas, hubX, hubY, placement);
            }
            for (String id : activeGroups) {
                float x = topologyGroupX(activeGroups.indexOf(id), activeGroups.size(), width);
                drawCenteredText(canvas, topologyGroupLabel(id), x, dp(32), 12, C.TEXT, Typeface.BOLD);
                drawCenteredText(canvas, topologyGroupDetail(id), x, dp(49), 10, C.MUTED, Typeface.BOLD);
            }
            drawTopologyHub(canvas, hubX, hubY);
            for (TopologyPlacement placement : placements) {
                drawTopologyNode(canvas, placement.host, placement.x, placement.y, placement.moreCount);
            }
        }

        private Map<String, List<Host>> topologyGroups() {
            Map<String, List<Host>> groups = new LinkedHashMap<>();
            for (String id : topologyGroupOrder()) groups.put(id, new ArrayList<Host>());
            for (Host host : hosts) groups.get(topologyGroupFor(host)).add(host);
            return groups;
        }

        private List<String> topologyGroupOrder() {
            List<String> order = new ArrayList<>();
            order.add("controller");
            order.add("gpu");
            order.add("spark");
            order.add("edge");
            order.add("other");
            return order;
        }

        private List<TopologyPlacement> topologyPlacements(List<String> activeGroups, Map<String, List<Host>> groups, int width, int height) {
            List<TopologyPlacement> placements = new ArrayList<>();
            for (int groupIndex = 0; groupIndex < activeGroups.size(); groupIndex++) {
                String id = activeGroups.get(groupIndex);
                List<Host> members = groups.get(id);
                if (members == null) continue;
                int shown = Math.min(4, members.size());
                float stepY = shown >= 4 ? dp(72) : shown == 3 ? dp(86) : dp(96);
                float startY = height * 0.52f - Math.max(0, shown - 1) * stepY / 2f;
                float x = topologyGroupX(groupIndex, activeGroups.size(), width);
                for (int i = 0; i < shown; i++) {
                    placements.add(new TopologyPlacement(members.get(i), x, startY + i * stepY, 0));
                }
                int hidden = members.size() - shown;
                if (hidden > 0) {
                    placements.add(new TopologyPlacement(members.get(0), x, Math.min(height - dp(32), startY + shown * stepY), hidden));
                }
            }
            return placements;
        }

        private float topologyGroupX(int index, int count, int width) {
            float startX = count <= 3 ? width * 0.42f : width * 0.34f;
            float endX = width - dp(72);
            float step = count <= 1 ? 0 : (endX - startX) / Math.max(1, count - 1);
            return Math.max(dp(150), Math.min(width - dp(70), startX + index * step));
        }

        private void drawTopologyLink(Canvas canvas, float hubX, float hubY, TopologyPlacement placement) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(3));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setColor(withAlpha(toneColor(placement.host.riskTone()), 160));
            paint.setPathEffect(placement.host.riskTone() == Tone.GOOD ? null : new DashPathEffect(new float[] {dp(7), dp(6)}, 0));
            Path path = new Path();
            path.moveTo(hubX + dp(52), hubY);
            path.cubicTo(hubX + dp(108), hubY, placement.x - dp(126), placement.y, placement.x - dp(72), placement.y);
            canvas.drawPath(path, paint);
            paint.setPathEffect(null);
        }

        private void drawTopologyHub(Canvas canvas, float x, float y) {
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(C.HEADER);
            canvas.drawCircle(x, y, dp(52), paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(2));
            paint.setColor(C.CYAN);
            canvas.drawCircle(x, y, dp(52), paint);
            drawCenteredText(canvas, "turbalance", x, y - dp(4), 12, Color.WHITE, Typeface.BOLD);
            drawCenteredText(canvas, "collector", x, y + dp(15), 10, C.MUTED, Typeface.BOLD);
        }

        private void drawTopologyNode(Canvas canvas, Host host, float x, float y, int moreCount) {
            int tone = host.riskTone();
            int fill = tone == Tone.POOR ? C.RED_DARK : tone == Tone.WATCH ? C.AMBER_DARK : C.PANEL;
            int stroke = toneColor(tone);
            rect.set(x - dp(68), y - dp(26), x + dp(68), y + dp(26));
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(fill);
            canvas.drawRoundRect(rect, dp(8), dp(8), paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(1));
            paint.setColor(stroke);
            canvas.drawRoundRect(rect, dp(8), dp(8), paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(stroke);
            canvas.drawCircle(x - dp(52), y - dp(7), dp(5), paint);

            String title = moreCount > 0 ? "+" + moreCount + " more" : host.name;
            String detail = moreCount > 0 ? topologyGroupLabel(topologyGroupFor(host)) : topologyNodeMeta(host);
            drawLeftText(canvas, fitText(title, dp(90), 12, Typeface.BOLD), x - dp(39), y - dp(6), 12, Color.WHITE, Typeface.BOLD);
            drawLeftText(canvas, fitText(detail, dp(94), 10, Typeface.BOLD), x - dp(39), y + dp(13), 10, C.MUTED, Typeface.BOLD);
        }

        private String topologyNodeMeta(Host host) {
            if (host.hasGpuEvidence()) return "GPU " + pct(host.gpuPct);
            if (!host.networkInterface.isEmpty()) return host.networkInterface;
            return host.status;
        }

        private String fitText(String value, float maxWidth, int sp, int style) {
            String text = value == null ? "" : value;
            paint.setTextSize(sp(sp));
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, style));
            if (paint.measureText(text) <= maxWidth) return text;
            while (text.length() > 3 && paint.measureText(text + "...") > maxWidth) {
                text = text.substring(0, text.length() - 1);
            }
            return text + "...";
        }

        private void drawCenteredText(Canvas canvas, String value, float x, float y, int sp, int color, int style) {
            paint.setStyle(Paint.Style.FILL);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(sp(sp));
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, style));
            paint.setColor(color);
            canvas.drawText(value, x, y, paint);
        }

        private void drawLeftText(Canvas canvas, String value, float x, float y, int sp, int color, int style) {
            paint.setStyle(Paint.Style.FILL);
            paint.setTextAlign(Paint.Align.LEFT);
            paint.setTextSize(sp(sp));
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, style));
            paint.setColor(color);
            canvas.drawText(value, x, y, paint);
        }

        private float sp(int value) {
            return value * getResources().getDisplayMetrics().scaledDensity;
        }
    }

    private static final class TopologyPlacement {
        final Host host;
        final float x;
        final float y;
        final int moreCount;

        TopologyPlacement(Host host, float x, float y, int moreCount) {
            this.host = host;
            this.x = x;
            this.y = y;
            this.moreCount = moreCount;
        }
    }

    private String topologyGroupFor(Host host) {
        String text = (host.name + " " + host.role + " " + host.gpuTopologySummary + " " + host.serviceSummary()).toLowerCase(Locale.US);
        if (text.contains("nuc") || text.contains("controller") || text.contains("collector") || text.contains("grafana") || text.contains("prometheus")) return "controller";
        if (text.contains("spark")) return "spark";
        if (text.contains("dgx") || text.contains("gb10") || text.contains("h100") || text.contains("a100") || text.contains("nvidia") || host.hasGpuEvidence()) return "gpu";
        if (text.contains("raspberry") || text.contains("edge") || text.matches(".*(^|[^a-z])pi\\d+.*")) return "edge";
        return "other";
    }

    private String topologyGroupLabel(String id) {
        if ("controller".equals(id)) return "Controller";
        if ("gpu".equals(id)) return "DGX / GPU";
        if ("spark".equals(id)) return "SPARK";
        if ("edge".equals(id)) return "Pi / Edge";
        return "Other";
    }

    private String topologyGroupDetail(String id) {
        if ("controller".equals(id)) return "ingest and UI";
        if ("gpu".equals(id)) return "accelerators";
        if ("spark".equals(id)) return "demo peers";
        if ("edge".equals(id)) return "field agents";
        return "observed";
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }

    private GradientDrawable rounded(int bg, int stroke, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(bg);
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private GradientDrawable circle(int bg, int stroke) {
        GradientDrawable drawable = rounded(bg, stroke, 24);
        drawable.setShape(GradientDrawable.OVAL);
        return drawable;
    }

    private void tintProgress(ProgressBar bar, int color) {
        if (Build.VERSION.SDK_INT >= 21) {
            bar.setProgressTintList(ColorStateList.valueOf(color));
            bar.setProgressBackgroundTintList(ColorStateList.valueOf(C.TRACK));
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private Bitmap loadAssetBitmap(String path) {
        try {
            InputStream input = getAssets().open(path);
            return BitmapFactory.decodeStream(input);
        } catch (IOException error) {
            return null;
        }
    }

    private void loadAvatarImage() {
        String uriText = prefs.getString(KEY_PROFILE_IMAGE_URI, "");
        if (uriText.isEmpty()) {
            avatarImageView.setVisibility(View.GONE);
            avatarInitialsView.setVisibility(View.VISIBLE);
            return;
        }
        try {
            Uri uri = Uri.parse(uriText);
            InputStream stream = getContentResolver().openInputStream(uri);
            Bitmap bitmap = BitmapFactory.decodeStream(stream);
            avatarImageView.setImageBitmap(bitmap);
            avatarImageView.setVisibility(View.VISIBLE);
            avatarInitialsView.setVisibility(View.GONE);
        } catch (Exception error) {
            avatarImageView.setVisibility(View.GONE);
            avatarInitialsView.setVisibility(View.VISIBLE);
        }
    }

    private String profileName() {
        String saved = prefs == null ? "" : prefs.getString(KEY_PROFILE_NAME, "");
        if (saved != null && !saved.trim().isEmpty()) return saved.trim();
        String device = deviceName();
        if (device.toLowerCase(Locale.US).contains("android") || device.toLowerCase(Locale.US).contains("sdk")) {
            return "Set your name";
        }
        return device;
    }

    private String profileInitials() {
        String name = profileName();
        String[] parts = name.replace("'", " ").split("[^A-Za-z0-9]+");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (!part.isEmpty()) {
                builder.append(part.substring(0, 1).toUpperCase(Locale.US));
                if (builder.length() == 2) break;
            }
        }
        return builder.length() == 0 ? "TU" : builder.toString();
    }

    private String profileDetail() {
        String device = deviceName();
        return device.isEmpty() ? "This Android phone" : device;
    }

    private String deviceName() {
        try {
            String name = Settings.Global.getString(getContentResolver(), "device_name");
            if (name != null && !name.trim().isEmpty()) return name.trim();
        } catch (Exception ignored) {
        }
        return Build.MODEL == null ? "Android phone" : Build.MODEL;
    }

    private String freshnessText() {
        if (isRefreshing) return "Refreshing now";
        if (lastUpdated != null) return "Updated " + relative(lastUpdated);
        return snapshot.freshnessLabel();
    }

    private static String readAll(InputStream stream) throws IOException {
        BufferedInputStream input = new BufferedInputStream(stream);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) >= 0) {
            output.write(buffer, 0, read);
        }
        return output.toString("UTF-8");
    }

    private static String pct(double value) {
        return String.format(Locale.US, "%.0f%%", clamp(value, 0, 100));
    }

    private static String compact(double value) {
        if (Math.abs(value) >= 100) return String.format(Locale.US, "%.0f", value);
        if (Math.abs(value) >= 10) return String.format(Locale.US, "%.1f", value);
        return String.format(Locale.US, "%.2f", value);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static String join(List<String> items, String separator) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) builder.append(separator);
            builder.append(items.get(i));
        }
        return builder.toString();
    }

    private static String emptyFallback(String value) {
        if (value == null || value.trim().isEmpty()) return "n/a";
        return value.trim();
    }

    private static int toneForHealth(double health) {
        if (health < 60) return Tone.POOR;
        if (health < 80) return Tone.WATCH;
        return Tone.GOOD;
    }

    private static int pressureTone(double pct) {
        if (pct >= 90) return Tone.POOR;
        if (pct >= 75) return Tone.WATCH;
        return Tone.GOOD;
    }

    private static int toneForUtil(double pct) {
        if (pct >= 80) return Tone.GOOD;
        if (pct >= 40) return Tone.WATCH;
        return Tone.POOR;
    }

    private static int toneColor(int tone) {
        if (tone == Tone.POOR) return C.RED;
        if (tone == Tone.WATCH) return C.AMBER;
        return C.GREEN;
    }

    private static String relative(Date date) {
        long seconds = Math.max(0, (System.currentTimeMillis() - date.getTime()) / 1000);
        if (seconds < 60) return seconds + "s ago";
        long minutes = seconds / 60;
        if (minutes < 60) return minutes + "m ago";
        long hours = minutes / 60;
        return hours + "h ago";
    }

    private interface ThresholdSetter {
        void set(double value);
    }

    private static final class C {
        static final int BACKGROUND = Color.rgb(7, 17, 20);
        static final int HEADER = Color.rgb(15, 37, 45);
        static final int PANEL = Color.rgb(14, 28, 34);
        static final int TRACK = Color.rgb(25, 48, 56);
        static final int BORDER = Color.rgb(44, 77, 86);
        static final int TEXT = Color.rgb(221, 238, 239);
        static final int MUTED = Color.rgb(141, 168, 173);
        static final int CYAN = Color.rgb(65, 218, 226);
        static final int BLUE = Color.rgb(53, 115, 228);
        static final int GREEN = Color.rgb(53, 219, 140);
        static final int GREEN_DARK = Color.rgb(18, 84, 54);
        static final int AMBER = Color.rgb(244, 183, 82);
        static final int AMBER_DARK = Color.rgb(96, 62, 20);
        static final int RED = Color.rgb(239, 88, 102);
        static final int RED_DARK = Color.rgb(89, 31, 40);
    }

    private static final class Tone {
        static final int GOOD = 1;
        static final int WATCH = 2;
        static final int POOR = 3;
    }

    private static final class HistoryPoint {
        final String label;
        final double gpu;
        final double cpu;
        final double memory;
        final double health;

        HistoryPoint(Snapshot snapshot) {
            SimpleDateFormat formatter = new SimpleDateFormat("HH:mm", Locale.US);
            this.label = formatter.format(new Date());
            this.gpu = snapshot.summary.averageGpuPct;
            this.cpu = snapshot.summary.averageCpuPct;
            this.memory = snapshot.summary.averageMemoryPct;
            this.health = snapshot.summary.averageHealthScore;
        }
    }

    private static final class ThresholdSettings {
        boolean enabled = false;
        double cpuPct = 85;
        double gpuPct = 95;
        double memoryPct = 88;
        double diskPct = 85;
        double healthScore = 70;
        double queueMinutes = 5;
        double networkMBps = 250;
        double cooldownMinutes = 10;

        static ThresholdSettings load(SharedPreferences prefs) {
            ThresholdSettings settings = new ThresholdSettings();
            settings.enabled = prefs.getBoolean(KEY_ALERTS_ENABLED, false);
            settings.cpuPct = Double.longBitsToDouble(prefs.getLong(KEY_CPU, Double.doubleToLongBits(settings.cpuPct)));
            settings.gpuPct = Double.longBitsToDouble(prefs.getLong(KEY_GPU, Double.doubleToLongBits(settings.gpuPct)));
            settings.memoryPct = Double.longBitsToDouble(prefs.getLong(KEY_MEMORY, Double.doubleToLongBits(settings.memoryPct)));
            settings.diskPct = Double.longBitsToDouble(prefs.getLong(KEY_DISK, Double.doubleToLongBits(settings.diskPct)));
            settings.healthScore = Double.longBitsToDouble(prefs.getLong(KEY_HEALTH, Double.doubleToLongBits(settings.healthScore)));
            settings.queueMinutes = Double.longBitsToDouble(prefs.getLong(KEY_QUEUE, Double.doubleToLongBits(settings.queueMinutes)));
            settings.networkMBps = Double.longBitsToDouble(prefs.getLong(KEY_NETWORK, Double.doubleToLongBits(settings.networkMBps)));
            settings.cooldownMinutes = Double.longBitsToDouble(prefs.getLong(KEY_COOLDOWN, Double.doubleToLongBits(settings.cooldownMinutes)));
            return settings;
        }

        void save(SharedPreferences prefs) {
            prefs.edit()
                .putBoolean(KEY_ALERTS_ENABLED, enabled)
                .putLong(KEY_CPU, Double.doubleToLongBits(cpuPct))
                .putLong(KEY_GPU, Double.doubleToLongBits(gpuPct))
                .putLong(KEY_MEMORY, Double.doubleToLongBits(memoryPct))
                .putLong(KEY_DISK, Double.doubleToLongBits(diskPct))
                .putLong(KEY_HEALTH, Double.doubleToLongBits(healthScore))
                .putLong(KEY_QUEUE, Double.doubleToLongBits(queueMinutes))
                .putLong(KEY_NETWORK, Double.doubleToLongBits(networkMBps))
                .putLong(KEY_COOLDOWN, Double.doubleToLongBits(cooldownMinutes))
                .apply();
        }

        List<Breach> breaches(Snapshot snapshot) {
            List<Breach> breaches = new ArrayList<>();
            if (snapshot.summary.averageCpuPct >= cpuPct) {
                breaches.add(new Breach("fleet-cpu", "CPU threshold crossed", "Average fleet CPU is " + pct(snapshot.summary.averageCpuPct) + ", above the " + pct(cpuPct) + " alert threshold.", Tone.WATCH));
            }
            if (snapshot.summary.averageGpuPct >= gpuPct) {
                breaches.add(new Breach("fleet-gpu", "GPU threshold crossed", "Average fleet GPU is " + pct(snapshot.summary.averageGpuPct) + ", above the " + pct(gpuPct) + " alert threshold.", Tone.WATCH));
            }
            if (snapshot.summary.averageMemoryPct >= memoryPct) {
                breaches.add(new Breach("fleet-memory", "Memory threshold crossed", "Average memory pressure is " + pct(snapshot.summary.averageMemoryPct) + ", above the " + pct(memoryPct) + " alert threshold.", Tone.POOR));
            }
            if (snapshot.summary.averageDiskPct >= diskPct) {
                breaches.add(new Breach("fleet-disk", "Disk threshold crossed", "Average disk pressure is " + pct(snapshot.summary.averageDiskPct) + ", above the " + pct(diskPct) + " alert threshold.", Tone.POOR));
            }
            if (snapshot.summary.averageHealthScore <= healthScore) {
                breaches.add(new Breach("fleet-health", "Health threshold crossed", "Average health is " + pct(snapshot.summary.averageHealthScore) + ", below the " + pct(healthScore) + " alert threshold.", Tone.POOR));
            }
            if (snapshot.summary.maxQueueMinutes >= queueMinutes) {
                breaches.add(new Breach("fleet-queue", "Queue threshold crossed", "Max queue wait is " + compact(snapshot.summary.maxQueueMinutes) + " minutes, above the " + compact(queueMinutes) + " minute threshold.", Tone.WATCH));
            }
            if (snapshot.summary.totalNetworkMBps >= networkMBps) {
                breaches.add(new Breach("fleet-network", "Network threshold crossed", "Fleet throughput is " + compact(snapshot.summary.totalNetworkMBps) + " MB/s, above the " + compact(networkMBps) + " MB/s threshold.", Tone.WATCH));
            }
            int hostCount = 0;
            for (Host host : snapshot.hosts) {
                if (host.riskTone() == Tone.POOR && hostCount < 3) {
                    breaches.add(new Breach("host-" + host.id, host.name + " needs action", host.primaryAction(), Tone.POOR));
                    hostCount++;
                }
            }
            return breaches;
        }
    }

    private static final class Breach {
        final String id;
        final String title;
        final String detail;
        final int tone;

        Breach(String id, String title, String detail, int tone) {
            this.id = id;
            this.title = title;
            this.detail = detail;
            this.tone = tone;
        }
    }

    private static final class Signal {
        final String id;
        final String title;
        final String detail;
        final int tone;

        Signal(String id, String title, String detail, int tone) {
            this.id = id;
            this.title = title;
            this.detail = detail;
            this.tone = tone;
        }
    }

    private static final class Snapshot {
        final String generatedAt;
        final Date generatedAtDate;
        final String sourceLabel;
        final String observedHost;
        final List<Host> hosts;
        final List<Signal> signals;
        final List<String> importedSources;
        final Summary summary;

        Snapshot(String generatedAt, Date generatedAtDate, String sourceLabel, String observedHost, List<Host> hosts, List<Signal> signals, List<String> importedSources, Summary summary) {
            this.generatedAt = generatedAt;
            this.generatedAtDate = generatedAtDate;
            this.sourceLabel = sourceLabel;
            this.observedHost = observedHost;
            this.hosts = hosts;
            this.signals = signals;
            this.importedSources = importedSources;
            this.summary = summary;
        }

        static Snapshot fromJson(String json, String sourceLabel) throws JSONException {
            JSONObject bundle = new JSONObject(json);
            JSONObject metadata = bundle.optJSONObject("metadata");
            JSONObject ingestion = bundle.optJSONObject("ingestion");
            JSONArray runs = ingestion == null ? new JSONArray() : ingestion.optJSONArray("runs");
            if (runs == null) runs = new JSONArray();
            List<Host> hosts = new ArrayList<>();
            Set<String> sources = new HashSet<>();
            int gpuCount = 0;
            for (int i = 0; i < runs.length(); i++) {
                JSONObject run = runs.optJSONObject(i);
                if (run == null) continue;
                hosts.add(Host.fromRun(run, i));
                JSONObject allocation = run.optJSONObject("allocation");
                gpuCount += (int) Math.round(number(allocation, "gpus", 0));
                JSONArray imported = run.optJSONArray("importedSources");
                if (imported != null) {
                    for (int j = 0; j < imported.length(); j++) sources.add(imported.optString(j));
                }
            }
            JSONArray sourceAdapters = metadata == null ? null : metadata.optJSONArray("sourceAdapters");
            if (sourceAdapters != null) {
                for (int j = 0; j < sourceAdapters.length(); j++) sources.add(sourceAdapters.optString(j));
            }
            String generated = metadata == null ? "Unknown" : metadata.optString("generatedAt", "Unknown");
            Date generatedDate = parseDate(generated);
            Summary summary = Summary.fromHosts(hosts, gpuCount);
            List<Signal> signals = signalsFromHosts(hosts);
            List<String> importedSources = new ArrayList<>(sources);
            Collections.sort(importedSources);
            String observedHost = metadata == null ? "" : metadata.optString("observedHost", "");
            if (observedHost.isEmpty() && !hosts.isEmpty()) observedHost = hosts.get(0).name;
            if (observedHost.isEmpty() && metadata != null) observedHost = metadata.optString("source", "Unknown");
            if (observedHost.isEmpty()) observedHost = "Unknown";
            return new Snapshot(generated, generatedDate, sourceLabel, observedHost, hosts, signals, importedSources, summary);
        }

        static Snapshot demo() {
            List<Host> hosts = new ArrayList<>();
            hosts.add(Host.demo("nuc14e", "NUC14E controller", "Product edge", 34, 0, 61, 42, 91));
            hosts.add(Host.demo("dgx-jensen", "DGX-jensen", "GB10 GPU host", 28, 18, 54, 47, 88));
            hosts.add(Host.demo("dgx-lisa", "DGX-lisa", "GB10 GPU host", 41, 54, 65, 39, 74));
            Summary summary = Summary.fromHosts(hosts, 2);
            return new Snapshot("Sample bundle", null, "Local sample", "local-controller", hosts, signalsFromHosts(hosts), new ArrayList<String>(), summary);
        }

        boolean isStale() {
            return generatedAtDate != null && System.currentTimeMillis() - generatedAtDate.getTime() > 120000;
        }

        String freshnessLabel() {
            if (generatedAtDate == null) return generatedAt;
            return relative(generatedAtDate);
        }

        String customerPosture() {
            if (summary.actionCount > 0) return "Action required";
            if (summary.watchCount > 0) return "Watch";
            return "Healthy";
        }

        String customerReportText() {
            StringBuilder builder = new StringBuilder();
            builder.append("turbalance customer report\n");
            builder.append("Generated: ").append(new SimpleDateFormat("MMM d, yyyy h:mm a", Locale.US).format(new Date())).append("\n");
            builder.append("Telemetry: ").append(sourceLabel).append(", ").append(freshnessLabel()).append("\n");
            builder.append("Observed host: ").append(observedHost).append("\n\n");
            builder.append("Fleet posture: ").append(customerPosture()).append("\n");
            builder.append("Hosts: ").append(summary.hostCount).append("\n");
            builder.append("GPU hosts: ").append(summary.gpuCount).append("\n");
            builder.append("Average health: ").append(pct(summary.averageHealthScore)).append("\n");
            builder.append("Average GPU: ").append(pct(summary.averageGpuPct)).append("\n");
            builder.append("Average CPU: ").append(pct(summary.averageCpuPct)).append("\n");
            builder.append("Average memory: ").append(pct(summary.averageMemoryPct)).append("\n");
            builder.append("Average disk: ").append(pct(summary.averageDiskPct)).append("\n");
            builder.append("Network throughput: ").append(compact(summary.totalNetworkMBps)).append(" MB/s\n");
            builder.append("Max queue wait: ").append(compact(summary.maxQueueMinutes)).append(" minutes\n\n");
            builder.append("What is going on:\n");
            for (String line : explanationLines()) builder.append(line).append("\n");
            builder.append("\nRecommended next steps:\n");
            for (String line : nextStepLines()) builder.append(line).append("\n");
            builder.append("\nCurrent signals:\n");
            for (Signal signal : signals) builder.append("- ").append(signal.title).append(": ").append(signal.detail).append("\n");
            builder.append("\nHost summary:\n");
            if (hosts.isEmpty()) {
                builder.append("- No host rows were available in this bundle.\n");
            } else {
                for (Host host : hosts) {
                    builder.append("- ").append(host.name).append(": ").append(host.riskLabel()).append(", health ").append(pct(host.hardwareHealthScore)).append(", CPU ").append(pct(host.cpuPct)).append(", GPU ").append(pct(host.gpuPct)).append(", memory ").append(pct(host.memoryPct)).append(", disk ").append(pct(host.diskPct)).append(". ").append(host.primaryAction()).append("\n");
                }
            }
            return builder.toString();
        }

        private List<String> explanationLines() {
            List<String> lines = new ArrayList<>();
            if (hosts.isEmpty()) {
                lines.add("- No host telemetry rows were available in this bundle, so the report cannot explain fleet behavior yet.");
                return lines;
            }
            if (isStale()) lines.add("- The telemetry feed is stale, so the report may describe a previous fleet state rather than the current moment.");
            if (summary.actionCount > 0) {
                lines.add("- The fleet is marked action required because " + summary.actionCount + " host" + (summary.actionCount == 1 ? "" : "s") + " crossed a hard health, memory, disk, thermal, or hardware-fault condition.");
            } else if (summary.watchCount > 0) {
                lines.add("- The fleet is in watch mode because " + summary.watchCount + " host" + (summary.watchCount == 1 ? "" : "s") + " has early warning pressure such as queue delay, clock drift, low GPU activity, or reduced health.");
            } else {
                lines.add("- The fleet is healthy: no configured high-severity host condition is currently active.");
            }
            if (summary.maxQueueMinutes > 0) lines.add("- Work is waiting in queue for up to " + compact(summary.maxQueueMinutes) + " minutes, which usually means placement, scheduler capacity, or input-pipeline locality needs review.");
            if (summary.averageMemoryPct >= 80) lines.add("- Average memory pressure is elevated at " + pct(summary.averageMemoryPct) + ", so workload packing or memory-heavy services may be constraining throughput.");
            if (summary.averageDiskPct >= 80) lines.add("- Average disk pressure is elevated at " + pct(summary.averageDiskPct) + ", which can slow ingestion and reduce benchmark confidence.");
            if (summary.averageHealthScore < 80) lines.add("- Average fleet health is " + pct(summary.averageHealthScore) + ", so the customer should treat the current evidence as an operational finding instead of a clean capacity baseline.");
            if (summary.gpuCount > 0 && summary.averageGpuPct < 15) lines.add("- GPU utilization is low across the sampled fleet even though GPU hosts are present, suggesting possible scheduler, model-server, or data-feed underuse.");
            List<Host> prioritized = prioritizedHosts();
            for (int i = 0; i < prioritized.size() && i < 3; i++) lines.add("- " + prioritized.get(i).customerExplanationSentence());
            return lines;
        }

        private List<String> nextStepLines() {
            List<Host> risky = new ArrayList<>();
            for (Host host : prioritizedHosts()) if (host.riskTone() != Tone.GOOD) risky.add(host);
            if (risky.isEmpty()) {
                List<String> lines = new ArrayList<>();
                lines.add("- Continue normal monitoring and use this report as the customer baseline for the current telemetry window.");
                return lines;
            }
            List<String> lines = new ArrayList<>();
            if (isStale()) lines.add("- Refresh live telemetry before making customer-facing commitments.");
            for (int i = 0; i < risky.size() && i < 4; i++) lines.add("- " + risky.get(i).name + ": " + risky.get(i).primaryAction());
            return lines;
        }

        private List<Host> prioritizedHosts() {
            List<Host> sorted = new ArrayList<>(hosts);
            Collections.sort(sorted, new Comparator<Host>() {
                @Override
                public int compare(Host a, Host b) {
                    int risk = b.customerRiskPriority() - a.customerRiskPriority();
                    if (risk != 0) return risk;
                    return Double.compare(a.hardwareHealthScore, b.hardwareHealthScore);
                }
            });
            return sorted;
        }

        private static List<Signal> signalsFromHosts(List<Host> hosts) {
            List<Signal> signals = new ArrayList<>();
            for (Host host : hosts) {
                if (host.riskTone() == Tone.POOR) signals.add(new Signal(host.id + "-action", "Action needed", host.name + ": " + host.primaryAction(), Tone.POOR));
                if (!host.clockSynchronized) signals.add(new Signal(host.id + "-clock", "Clock drift risk", host.name + " is not reporting a synchronized clock source.", Tone.WATCH));
                if (host.memoryPct >= 90) signals.add(new Signal(host.id + "-memory", "Memory pressure", host.name + " is at " + pct(host.memoryPct) + " memory use.", Tone.POOR));
                if (host.diskPct >= 90) signals.add(new Signal(host.id + "-disk", "Disk pressure", host.name + " is at " + pct(host.diskPct) + " disk use.", Tone.POOR));
                if (host.gpuPct < 10 && host.hasGpuEvidence()) signals.add(new Signal(host.id + "-gpu-idle", "GPU idle window", host.name + " has low GPU activity and should be checked for scheduler or input stalls.", Tone.WATCH));
                if (host.ollamaTimeToFirstTokenMs >= 2500) signals.add(new Signal(host.id + "-ollama-latency", "Model latency watch", host.name + " is reporting " + compact(host.ollamaTimeToFirstTokenMs) + " ms time to first token.", Tone.WATCH));
            }
            if (signals.isEmpty()) signals.add(new Signal("fleet-clear", "Fleet signal clear", "No high-severity pressure signals are present in the current bundle.", Tone.GOOD));
            return signals.size() > 8 ? signals.subList(0, 8) : signals;
        }
    }

    private static final class Summary {
        final int hostCount;
        final int gpuCount;
        final double averageGpuPct;
        final double averageCpuPct;
        final double averageMemoryPct;
        final double averageDiskPct;
        final double averageEfficiencyPct;
        final double averageHealthScore;
        final double totalNetworkMBps;
        final double maxQueueMinutes;
        final int actionCount;
        final int watchCount;

        Summary(int hostCount, int gpuCount, double averageGpuPct, double averageCpuPct, double averageMemoryPct, double averageDiskPct, double averageEfficiencyPct, double averageHealthScore, double totalNetworkMBps, double maxQueueMinutes, int actionCount, int watchCount) {
            this.hostCount = hostCount;
            this.gpuCount = gpuCount;
            this.averageGpuPct = averageGpuPct;
            this.averageCpuPct = averageCpuPct;
            this.averageMemoryPct = averageMemoryPct;
            this.averageDiskPct = averageDiskPct;
            this.averageEfficiencyPct = averageEfficiencyPct;
            this.averageHealthScore = averageHealthScore;
            this.totalNetworkMBps = totalNetworkMBps;
            this.maxQueueMinutes = maxQueueMinutes;
            this.actionCount = actionCount;
            this.watchCount = watchCount;
        }

        static Summary fromHosts(List<Host> hosts, int gpuCount) {
            int action = 0;
            int watch = 0;
            double gpu = 0, cpu = 0, memory = 0, disk = 0, efficiency = 0, health = 0, network = 0, queue = 0;
            for (Host host : hosts) {
                gpu += host.gpuPct;
                cpu += host.cpuPct;
                memory += host.memoryPct;
                disk += host.diskPct;
                efficiency += host.efficiencyPct;
                health += host.hardwareHealthScore;
                network += host.networkMBps;
                queue = Math.max(queue, host.queueMinutes);
                if (host.riskTone() == Tone.POOR) action++;
                if (host.riskTone() == Tone.WATCH) watch++;
            }
            int count = Math.max(1, hosts.size());
            return new Summary(hosts.size(), gpuCount, gpu / count, cpu / count, memory / count, disk / count, efficiency / count, health / count, network, queue, action, watch);
        }
    }

    private static final class Host {
        final String id;
        final String name;
        final String role;
        final String status;
        final double cpuPct;
        final double gpuPct;
        final double memoryPct;
        final double diskPct;
        final double networkMBps;
        final double networkUtilizationPct;
        final double queueMinutes;
        final double efficiencyPct;
        final double hardwareHealthScore;
        final int hardwareFaultCount;
        final String hardwareFaultLevel;
        final String hardwareRepairAction;
        final boolean clockSynchronized;
        final double uptimeSeconds;
        final double gpuMemoryPct;
        final double gpuPowerWatts;
        final double gpuTemperatureC;
        final String gpuProcessSummary;
        final String gpuThermalSummary;
        final String gpuTopologySummary;
        final String ollamaStatus;
        final double ollamaTokensPerSecond;
        final double ollamaTimeToFirstTokenMs;
        final String ncclRuntimeStatus;
        final String ncclRuntimeDetail;
        final String networkInterface;
        final String networkLocalAddress;
        final double networkLinkSpeedMbps;
        final List<String> observedServices;
        final List<String> warnings;
        final String detail;

        Host(String id, String name, String role, String status, double cpuPct, double gpuPct, double memoryPct, double diskPct, double networkMBps, double networkUtilizationPct, double queueMinutes, double efficiencyPct, double hardwareHealthScore, int hardwareFaultCount, String hardwareFaultLevel, String hardwareRepairAction, boolean clockSynchronized, double uptimeSeconds, double gpuMemoryPct, double gpuPowerWatts, double gpuTemperatureC, String gpuProcessSummary, String gpuThermalSummary, String gpuTopologySummary, String ollamaStatus, double ollamaTokensPerSecond, double ollamaTimeToFirstTokenMs, String ncclRuntimeStatus, String ncclRuntimeDetail, String networkInterface, String networkLocalAddress, double networkLinkSpeedMbps, List<String> observedServices, List<String> warnings, String detail) {
            this.id = id;
            this.name = name;
            this.role = role;
            this.status = status;
            this.cpuPct = cpuPct;
            this.gpuPct = gpuPct;
            this.memoryPct = memoryPct;
            this.diskPct = diskPct;
            this.networkMBps = networkMBps;
            this.networkUtilizationPct = networkUtilizationPct;
            this.queueMinutes = queueMinutes;
            this.efficiencyPct = efficiencyPct;
            this.hardwareHealthScore = hardwareHealthScore;
            this.hardwareFaultCount = hardwareFaultCount;
            this.hardwareFaultLevel = hardwareFaultLevel;
            this.hardwareRepairAction = hardwareRepairAction;
            this.clockSynchronized = clockSynchronized;
            this.uptimeSeconds = uptimeSeconds;
            this.gpuMemoryPct = gpuMemoryPct;
            this.gpuPowerWatts = gpuPowerWatts;
            this.gpuTemperatureC = gpuTemperatureC;
            this.gpuProcessSummary = gpuProcessSummary;
            this.gpuThermalSummary = gpuThermalSummary;
            this.gpuTopologySummary = gpuTopologySummary;
            this.ollamaStatus = ollamaStatus;
            this.ollamaTokensPerSecond = ollamaTokensPerSecond;
            this.ollamaTimeToFirstTokenMs = ollamaTimeToFirstTokenMs;
            this.ncclRuntimeStatus = ncclRuntimeStatus;
            this.ncclRuntimeDetail = ncclRuntimeDetail;
            this.networkInterface = networkInterface;
            this.networkLocalAddress = networkLocalAddress;
            this.networkLinkSpeedMbps = networkLinkSpeedMbps;
            this.observedServices = observedServices;
            this.warnings = warnings;
            this.detail = detail;
        }

        static Host fromRun(JSONObject run, int index) {
            JSONObject context = run.optJSONObject("sourceContext");
            JSONObject allocation = run.optJSONObject("allocation");
            JSONObject utilization = run.optJSONObject("utilization");
            JSONObject communication = run.optJSONObject("communication");
            JSONObject inputPipeline = run.optJSONObject("inputPipeline");
            JSONObject scheduler = run.optJSONObject("scheduler");
            JSONObject baseline = run.optJSONObject("baseline");
            String hostname = string(context, "hostname", string(run, "name", "Host " + (index + 1)));
            String gpuModel = string(allocation, "gpuModel", string(context, "gpuName", "Host"));
            double cpu = number(context, "cpuUsagePct", number(inputPipeline, "cpuPrep", 0));
            double gpu = number(utilization, "gpuUtil", number(context, "gpuUtilizationPct", 0));
            double memory = number(context, "memoryUsedPct", number(context, "linuxUmaMemoryUsedPct", 0));
            double disk = number(context, "lakehouseDiskUsedPct", number(context, "diskUsedPct", 0));
            double rx = number(context, "networkRxBytesPerSecond", 0);
            double tx = number(context, "networkTxBytesPerSecond", 0);
            double efficiency = number(baseline, "gpuEfficiency", number(utilization, "usefulCompute", 0));
            boolean clock = bool(context, "clockSynchronized", true);
            double inferredHealth = clamp(100 - Math.max(0, memory - 70) * 0.6 - Math.max(0, disk - 80) * 0.7 - (clock ? 0 : 15), 0, 100);
            List<String> services = observedServices(context == null ? null : context.optJSONArray("observedServices"));
            List<String> warnings = new ArrayList<>();
            addWarning(warnings, string(context, "gpuError", ""));
            addWarning(warnings, string(context, "gpuDiagnosticsError", ""));
            addWarning(warnings, string(context, "ollamaProbeError", ""));
            String hardwareLevel = string(context, "hardwareFaultLevel", "");
            if (!hardwareLevel.isEmpty() && !"clear".equalsIgnoreCase(hardwareLevel) && !"healthy".equalsIgnoreCase(hardwareLevel) && !"ok".equalsIgnoreCase(hardwareLevel) && !"unknown".equalsIgnoreCase(hardwareLevel)) {
                addWarning(warnings, "Hardware " + hardwareLevel);
            }
            return new Host(
                string(run, "id", hostname),
                hostname,
                gpuModel,
                string(run, "status", "Observed"),
                clamp(cpu, 0, 100),
                clamp(gpu, 0, 100),
                clamp(memory, 0, 100),
                clamp(disk, 0, 100),
                Math.max(0, (rx + tx) / 1_000_000),
                clamp(number(context, "networkUtilizationPct", number(communication, "networkUtilization", 0)), 0, 100),
                Math.max(0, number(scheduler, "queueWaitMinutes", 0)),
                clamp(efficiency, 0, 100),
                clamp(number(context, "hardwareHealthScore", inferredHealth), 0, 100),
                Math.max(0, (int) number(context, "hardwareFaultCount", 0)),
                string(context, "hardwareFaultLevel", "unknown"),
                string(context, "hardwareRepairAction", "observe"),
                clock,
                Math.max(0, number(context, "uptimeSeconds", 0)),
                clamp(number(context, "gpuMemoryUsedPct", 0), 0, 100),
                Math.max(0, number(context, "gpuPowerWatts", 0)),
                Math.max(0, number(context, "gpuTemperatureC", 0)),
                string(context, "gpuProcessInspectorSummary", ""),
                string(context, "gpuThermalQualificationSummary", ""),
                string(context, "gpuTopologySummary", ""),
                string(context, "ollamaTelemetryStatus", ""),
                Math.max(0, number(context, "ollamaTokensPerSecond", 0)),
                Math.max(0, number(context, "ollamaTimeToFirstTokenMs", 0)),
                string(context, "ncclRuntimeStatus", ""),
                string(context, "ncclRuntimeDetail", ""),
                string(context, "networkInterface", ""),
                string(context, "networkLocalAddress", ""),
                Math.max(0, number(context, "networkLinkSpeedMbps", 0)),
                services,
                warnings.size() > 4 ? warnings.subList(0, 4) : warnings,
                string(context, "clockSyncDetail", importedSourcesText(run))
            );
        }

        static Host demo(String id, String name, String role, double cpu, double gpu, double memory, double disk, double health) {
            return new Host(id, name, role, "Sample observation", cpu, gpu, memory, disk, 18, 9, 0, 72, health, 0, "clear", "observe", true, 172800, 0, 0, 0, "No active GPU process attribution in the sample.", "Thermal state clear.", "Sample topology.", "reachable", 34, 480, "observed", "Sample NCCL runtime", "enp1s0f1np1", "192.168.10.103", 1000, new ArrayList<String>(), new ArrayList<String>(), "Sample telemetry bundle");
        }

        int riskTone() {
            if (hardwareFaultCount > 0 || hardwareHealthScore < 60 || memoryPct >= 90 || diskPct >= 90) return Tone.POOR;
            String thermal = gpuThermalSummary.toLowerCase(Locale.US);
            if (thermal.contains("throttle") && !thermal.contains("no throttle") && !thermal.contains("throttle active: false")) return Tone.POOR;
            if (!clockSynchronized || memoryPct >= 80 || diskPct >= 80 || queueMinutes > 0 || hardwareHealthScore < 80) return Tone.WATCH;
            if (hasGpuEvidence() && gpuPct < 10) return Tone.WATCH;
            return Tone.GOOD;
        }

        String riskLabel() {
            int tone = riskTone();
            return tone == Tone.POOR ? "Action" : tone == Tone.WATCH ? "Watch" : "Healthy";
        }

        String primaryAction() {
            if (!hardwareRepairAction.isEmpty() && !"observe".equals(hardwareRepairAction)) return titleCase(hardwareRepairAction.replace("-", " "));
            if (hardwareFaultCount > 0) return "Review hardware fault evidence before scheduling new workload.";
            if (memoryPct >= 90) return "Reduce memory pressure or drain low-priority workload.";
            if (diskPct >= 90) return "Clear disk pressure before ingestion or benchmark collection.";
            if (!clockSynchronized) return "Restore clock sync before comparing benchmark evidence.";
            if (hasGpuEvidence() && gpuPct < 10) return "Check queue, placement, input pipeline, and model server state.";
            if (queueMinutes > 0) return "Review queue delay and placement locality.";
            return "Continue observing.";
        }

        boolean hasGpuEvidence() {
            return gpuPct > 0 || gpuMemoryPct > 0 || gpuPowerWatts > 0 || role.toLowerCase(Locale.US).contains("gpu");
        }

        String serviceSummary() {
            return observedServices.isEmpty() ? "No service probe rows" : join(observedServices, ", ");
        }

        int customerRiskPriority() {
            int tone = riskTone();
            return tone == Tone.POOR ? 3 : tone == Tone.WATCH ? 2 : 1;
        }

        String customerExplanationSentence() {
            List<String> reasons = new ArrayList<>();
            if (hardwareFaultCount > 0) reasons.add(hardwareFaultCount + " hardware fault" + (hardwareFaultCount == 1 ? "" : "s") + " reported");
            if (hardwareHealthScore < 80) reasons.add("health is " + pct(hardwareHealthScore));
            if (memoryPct >= 80) reasons.add("memory is " + pct(memoryPct));
            if (diskPct >= 80) reasons.add("disk is " + pct(diskPct));
            if (queueMinutes > 0) reasons.add("queue wait is " + compact(queueMinutes) + " minutes");
            if (!clockSynchronized) reasons.add("clock sync is not confirmed");
            String thermal = gpuThermalSummary.toLowerCase(Locale.US);
            if (thermal.contains("throttle") && !thermal.contains("no throttle") && !thermal.contains("throttle active: false")) reasons.add("GPU thermal throttling is suspected");
            if (hasGpuEvidence() && gpuPct < 10) reasons.add("GPU activity is only " + pct(gpuPct));
            if (reasons.isEmpty()) return name + " is healthy; telemetry is inside expected operating bounds.";
            return name + " is " + riskLabel().toLowerCase(Locale.US) + " because " + join(reasons, ", ") + ".";
        }
    }

    private static String string(JSONObject object, String key, String fallback) {
        if (object == null || !object.has(key) || object.isNull(key)) return fallback;
        return object.optString(key, fallback);
    }

    private static double number(JSONObject object, String key, double fallback) {
        if (object == null || !object.has(key) || object.isNull(key)) return fallback;
        Object value = object.opt(key);
        if (value instanceof Number) return ((Number) value).doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception error) {
            return fallback;
        }
    }

    private static boolean bool(JSONObject object, String key, boolean fallback) {
        if (object == null || !object.has(key) || object.isNull(key)) return fallback;
        Object value = object.opt(key);
        if (value instanceof Boolean) return (Boolean) value;
        return "true".equalsIgnoreCase(String.valueOf(value)) || "1".equals(String.valueOf(value));
    }

    private static List<String> observedServices(JSONArray array) {
        List<String> services = new ArrayList<>();
        if (array == null) return services;
        for (int i = 0; i < array.length(); i++) {
            Object value = array.opt(i);
            if (value instanceof JSONObject) {
                JSONObject object = (JSONObject) value;
                String name = object.optString("name", object.optString("service", object.optString("label", "service")));
                String status = object.optString("status", "");
                if (status.isEmpty() && object.has("reachable")) status = object.optBoolean("reachable") ? "up" : "down";
                services.add(status.isEmpty() ? name : name + ": " + status);
            } else if (value != null) {
                services.add(String.valueOf(value));
            }
        }
        return services;
    }

    private static void addWarning(List<String> warnings, String value) {
        if (value != null && !value.trim().isEmpty()) warnings.add(value.trim());
    }

    private static String importedSourcesText(JSONObject run) {
        JSONArray imported = run.optJSONArray("importedSources");
        if (imported == null || imported.length() == 0) return "Telemetry bundle";
        List<String> items = new ArrayList<>();
        for (int i = 0; i < imported.length(); i++) items.add(imported.optString(i));
        return join(items, ", ");
    }

    private static String titleCase(String value) {
        String[] words = value.split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) continue;
            if (builder.length() > 0) builder.append(" ");
            builder.append(word.substring(0, 1).toUpperCase(Locale.US)).append(word.length() > 1 ? word.substring(1).toLowerCase(Locale.US) : "");
        }
        return builder.toString();
    }

    private static Date parseDate(String value) {
        if (value == null || value.trim().isEmpty() || "Unknown".equals(value) || "Sample bundle".equals(value)) return null;
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat formatter = new SimpleDateFormat(pattern, Locale.US);
                formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
                return formatter.parse(value);
            } catch (ParseException ignored) {
            }
        }
        return null;
    }
}
