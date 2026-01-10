In order to do anything, you need to add some documents to OpenContracts.

### Go to the Documents tab

Click on the "Documents" entry in the menu to bring
up a view of all documents you have read and/or write access to:

![](../assets/images/screenshots/Empty_Documents_View.png)

### Open the Action Menu
Now, click on the "Action" dropdown to open the Action menu for available actions and click "Import":

![](../assets/images/screenshots/Doc_Action_Menu.png)

This will bring up a dialog to load documents:

![](../assets/images/screenshots/Import_Documents_Modal.png)

### Select Documents to Upload
OpenContracts works with PDFs and several other document formats including Word documents (.docx),
PowerPoint presentations (.pptx), and plain text files. It doesn't matter if PDFs are OCRed or not as
OpenContracts can perform its own OCR to ensure consistent quality and outputs. Once you've added documents
for upload, you'll see a list of documents:

![](../assets/images/screenshots/Import_Documents_Modal.png)

Click on a document to change the description or title:

![](../assets/images/screenshots/Edit_Document_Details.png)

### Upload Your Documents
Click upload to upload the documents to OpenContracts. **Note:** Once the documents are
uploaded, they are automatically processed by the document parser (Docling by default) to extract text,
structure, and create a layer of tokens - each one representing a word or symbol with its X,Y coordinates
on the page. This is what powers the OpenContracts annotator and allows us to create both layout-aware
and text-only annotations. **While the document is being processed, it will not be available for viewing
and cannot be added to a corpus. You'll see a loading indicator on the document until processing is complete.
This only happens once and can take a few minutes depending on the document length and complexity.**

For more details on the document processing pipeline, see the
[Pipeline Overview](../pipelines/pipeline_overview.md).

![](../assets/images/screenshots/Document_Processing.png)
