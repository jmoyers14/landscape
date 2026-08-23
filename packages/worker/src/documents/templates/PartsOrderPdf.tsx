import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PartsOrderDocument } from "@landscape/platform";
import {
  DocumentHeader,
  PageFooter,
  formatCurrency,
  formatQuantity,
  styles,
} from "./shared.tsx";

/**
 * The supplier-facing materials list: what to pull, at cost.
 *
 * Deliberately unlike the estimate. It carries unit prices (a supplier needs
 * them), no assembly grouping (a supplier doesn't care which phase a pipe is
 * for), no markup, and no tax note — the supplier charges their own tax, so
 * quoting ours would double it on their invoice. Delivery is its own line.
 */
export const PartsOrderPdf = ({ doc }: { doc: PartsOrderDocument }) => (
  <Document title={`${doc.title} — ${doc.project.name}`}>
    <Page size="LETTER" style={styles.page}>
      <DocumentHeader
        company={doc.company}
        project={doc.project}
        title={doc.title}
        createdAt={doc.createdAt}
      />

      <View style={styles.tableHeader} fixed>
        <Text style={styles.grow}>Material</Text>
        <Text style={styles.qtyCell}>Qty</Text>
        <Text style={styles.unitCell}>Unit</Text>
        <Text style={styles.priceCell}>Unit price</Text>
        <Text style={styles.amount}>Total</Text>
      </View>

      {doc.lines.map((line) => (
        <View
          key={`${line.description}-${line.unitPrice}`}
          style={styles.row}
          wrap={false}
        >
          <Text style={styles.grow}>{line.description}</Text>
          <Text style={styles.qtyCell}>{formatQuantity(line.quantity)}</Text>
          <Text style={styles.unitCell}>{line.unit ?? ""}</Text>
          <Text style={styles.priceCell}>{formatCurrency(line.unitPrice)}</Text>
          <Text style={styles.amount}>{formatCurrency(line.lineTotal)}</Text>
        </View>
      ))}

      <View style={styles.row} wrap={false}>
        <Text style={styles.grow}>Subtotal</Text>
        <Text style={styles.amount}>{formatCurrency(doc.subtotal)}</Text>
      </View>
      <View style={styles.row} wrap={false}>
        <Text style={styles.grow}>Delivery</Text>
        <Text style={styles.amount}>{formatCurrency(doc.deliveryTotal)}</Text>
      </View>
      <View style={styles.totalRow} wrap={false}>
        <Text style={styles.grow}>Total</Text>
        <Text style={styles.amount}>{formatCurrency(doc.total)}</Text>
      </View>

      <PageFooter businessName={doc.company.businessName} />
    </Page>
  </Document>
);
