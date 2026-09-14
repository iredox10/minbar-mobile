import { forwardRef } from "react";
import { Image, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export interface ShareCardData {
  title: string;
  subtitle?: string;
  badge?: string;
  footer?: string;
  artworkUri?: string;
  qrValue?: string;
  showQR?: boolean;
}

const ACCENT = "#d4a853";

/**
 * Native port of web `ShareCard` (1080x1080 DOM node).
 * Fixed logical width; capture with react-native-view-shot at high
 * pixel ratio for ~1080px output. Solid bg + translucent circles
 * (no CSS gradients in RN raster).
 */
export const ShareCard = forwardRef<View, ShareCardData>(function ShareCard(
  { title, subtitle, badge, footer, artworkUri, qrValue, showQR = true },
  ref,
) {
  return (
    <View
      ref={ref}
      collapsable={false}
      className="bg-slate-950"
      style={{ width: 360, aspectRatio: 1, overflow: "hidden" }}
    >
      {/* Decorative circles */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: -70, right: -70, width: 220, height: 220, borderRadius: 110, backgroundColor: ACCENT, opacity: 0.08 }}
      />
      <View
        pointerEvents="none"
        style={{ position: "absolute", bottom: -90, left: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: ACCENT, opacity: 0.06 }}
      />
      {/* Accent lines */}
      <View style={{ position: "absolute", top: 24, left: 24, right: 24, height: 2, backgroundColor: ACCENT, opacity: 0.3 }} />
      <View style={{ position: "absolute", bottom: 24, left: 24, right: 24, height: 2, backgroundColor: ACCENT, opacity: 0.3 }} />

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        {badge ? (
          <View style={{ backgroundColor: `${ACCENT}26`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12 }}>
            <Text style={{ color: ACCENT, fontSize: 12, fontWeight: "700" }}>{badge}</Text>
          </View>
        ) : null}

        {artworkUri ? (
          <Image
            source={{ uri: artworkUri }}
            style={{ width: 120, height: 120, borderRadius: 20, marginBottom: 14 }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: `${ACCENT}33`, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Text style={{ color: ACCENT, fontSize: 28, fontWeight: "800" }}>A</Text>
          </View>
        )}

        <Text numberOfLines={3} style={{ color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 28 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: ACCENT, fontSize: 15, fontWeight: "600", marginTop: 8 }}>
            {subtitle}
          </Text>
        ) : null}

        {showQR && qrValue ? (
          <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 10, marginTop: 16 }}>
            <QRCode value={qrValue} size={110} backgroundColor="#ffffff" color="#0f172a" />
          </View>
        ) : null}

        <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 16, textAlign: "center" }}>
          {footer ?? "Listen on Arewa Central — Free. No Ads."}
        </Text>
      </View>
    </View>
  );
});
