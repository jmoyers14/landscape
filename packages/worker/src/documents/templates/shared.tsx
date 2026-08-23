import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DocumentCompany, DocumentProject } from "@landscape/platform";

/**
 * Formatting and chrome shared by both documents.
 *
 * These functions format; they never compute. Every number arriving here has
 * already been rounded by DocumentAssemblyService, so `formatCurrency` is a pure
 * presentation step and a template can never disagree with the estimate.
 */
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
export const formatCurrency = (value: number): string => usd.format(value);

const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
export const formatQuantity = (value: number): string => qty.format(value);

const date = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
export const formatDate = (iso: string): string => date.format(new Date(iso));

export const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 10,
    color: "#1f2933",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  logo: { width: 96, maxHeight: 48, objectFit: "contain", marginBottom: 6 },
  businessName: { fontSize: 16, marginBottom: 2 },
  muted: { color: "#616e7c" },
  metaBlock: { alignItems: "flex-end", maxWidth: 200 },
  sectionTitle: { fontSize: 12, marginTop: 16, marginBottom: 6 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#1f2933",
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd2d9",
    paddingVertical: 5,
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderTopColor: "#1f2933",
    paddingTop: 6,
    marginTop: 2,
  },
  grow: { flex: 1 },
  amount: { width: 90, textAlign: "right" },
  qtyCell: { width: 70, textAlign: "right" },
  // Qty is right-aligned and Unit is left-aligned, so without a gutter they
  // collide: "240" + "ft" reads as "240ft".
  unitCell: { width: 60, paddingLeft: 8 },
  priceCell: { width: 80, textAlign: "right" },
  note: { marginTop: 18, fontSize: 9, color: "#616e7c" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#616e7c",
    textAlign: "center",
  },
});

/**
 * Who is sending this, and about what. Renders whatever exists — an empty
 * business name or a missing logo degrades the header rather than failing the
 * document.
 */
export const DocumentHeader = ({
  company,
  project,
  title,
  createdAt,
}: {
  company: DocumentCompany;
  project: DocumentProject;
  title: string;
  createdAt: string;
}) => (
  <View style={styles.headerRow}>
    <View style={styles.grow}>
      {company.logo ? (
        <Image
          style={styles.logo}
          src={{
            // The view model carries plain bytes; react-pdf's image source is
            // typed as a Buffer.
            data: Buffer.from(company.logo.data),
            format: imageFormat(company.logo.contentType),
          }}
        />
      ) : null}
      {company.businessName ? (
        <Text style={styles.businessName}>{company.businessName}</Text>
      ) : null}
      {company.address ? (
        <Text style={styles.muted}>{company.address}</Text>
      ) : null}
      {company.phone ? <Text style={styles.muted}>{company.phone}</Text> : null}
      {company.email ? <Text style={styles.muted}>{company.email}</Text> : null}
      {company.licenseNumber ? (
        <Text style={styles.muted}>{company.licenseNumber}</Text>
      ) : null}
    </View>
    <View style={styles.metaBlock}>
      <Text style={styles.businessName}>{title}</Text>
      <Text style={styles.muted}>{formatDate(createdAt)}</Text>
      <Text>{project.name}</Text>
      {project.location ? (
        <Text style={styles.muted}>{project.location}</Text>
      ) : null}
    </View>
  </View>
);

/** `fixed` so it repeats, with the page numbers resolved per page at layout time. */
export const PageFooter = ({ businessName }: { businessName: string }) => (
  <Text
    style={styles.footer}
    fixed
    render={({ pageNumber, totalPages }) =>
      `${businessName ? `${businessName} — ` : ""}Page ${pageNumber} of ${totalPages}`
    }
  />
);

// react-pdf needs the raw format name, not a MIME type, when given a byte buffer.
function imageFormat(contentType: string): "png" | "jpg" {
  return contentType === "image/png" ? "png" : "jpg";
}
