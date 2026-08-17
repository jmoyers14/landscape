// THROWAWAY. Deleted in Task 12. Run: bun run packages/worker/src/documents/spike.tsx
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10 },
  row: {
    flexDirection: "row",
    borderBottom: "1pt solid #ccc",
    paddingVertical: 4,
  },
  cell: { flex: 1 },
  header: {
    flexDirection: "row",
    borderBottom: "2pt solid #000",
    paddingVertical: 4,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 9,
  },
});

const rows = Array.from({ length: 90 }, (_, i) => ({
  description: `Line item ${i + 1}`,
  amount: (i + 1) * 12.34,
}));

const SpikeDoc = () => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header} fixed>
        <Text style={styles.cell}>Description</Text>
        <Text style={styles.cell}>Amount</Text>
      </View>
      {rows.map((row) => (
        <View key={row.description} style={styles.row} wrap={false}>
          <Text style={styles.cell}>{row.description}</Text>
          <Text style={styles.cell}>${row.amount.toFixed(2)}</Text>
        </View>
      ))}
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
        fixed
      />
    </Page>
  </Document>
);

const buffer = await renderToBuffer(<SpikeDoc />);
await Bun.write("/tmp/spike.pdf", buffer);
console.log(
  `wrote ${buffer.byteLength} bytes; magic=${buffer.subarray(0, 5).toString()}`,
);
