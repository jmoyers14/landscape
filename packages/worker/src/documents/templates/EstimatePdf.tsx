import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { EstimateDocument } from "@landscape/platform";
import {
  DocumentHeader,
  PageFooter,
  formatCurrency,
  styles,
} from "./shared.tsx";

/**
 * The client-facing bid: one row per assembly, no unit prices, no line detail.
 *
 * Holds no arithmetic. `groups` and `total` arrive pre-computed and pre-rounded
 * from DocumentAssemblyService, and there is no tax row by design — sales tax is
 * already inside every figure, so `taxNote` says so instead.
 */
export const EstimatePdf = ({ doc }: { doc: EstimateDocument }) => (
  <Document title={`${doc.title} — ${doc.project.name}`}>
    <Page size="LETTER" style={styles.page}>
      <DocumentHeader
        company={doc.company}
        project={doc.project}
        title={doc.title}
        createdAt={doc.createdAt}
      />

      {doc.client ? (
        <View>
          <Text style={styles.sectionTitle}>Prepared for</Text>
          <Text>{doc.client.name}</Text>
          {doc.client.address ? (
            <Text style={styles.muted}>{doc.client.address}</Text>
          ) : null}
          {doc.client.email ? (
            <Text style={styles.muted}>{doc.client.email}</Text>
          ) : null}
          {doc.client.phone ? (
            <Text style={styles.muted}>{doc.client.phone}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Scope of work</Text>
      <View style={styles.tableHeader} fixed>
        <Text style={styles.grow}>Description</Text>
        <Text style={styles.amount}>Amount</Text>
      </View>

      {doc.groups.map((group) => (
        // wrap={false} keeps a row from splitting across a page break.
        <View key={group.label} style={styles.row} wrap={false}>
          <Text style={styles.grow}>{group.label}</Text>
          <Text style={styles.amount}>{formatCurrency(group.amount)}</Text>
        </View>
      ))}

      <View style={styles.totalRow} wrap={false}>
        <Text style={styles.grow}>Total</Text>
        <Text style={styles.amount}>{formatCurrency(doc.total)}</Text>
      </View>

      <Text style={styles.note}>{doc.taxNote}</Text>

      <PageFooter businessName={doc.company.businessName} />
    </Page>
  </Document>
);
