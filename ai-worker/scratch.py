import requests
import tempfile
import fitz

# Fetch a sample PDF
res_pdf = requests.get('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf')
with tempfile.NamedTemporaryFile(delete=False) as t:
    t.write(res_pdf.content)
    pdf_path = t.name

doc = fitz.open(pdf_path)
print("PDF is_pdf?", doc.is_pdf)
doc.close()

# Fetch a sample image
res_img = requests.get('https://via.placeholder.com/150.jpg')
with tempfile.NamedTemporaryFile(delete=False) as t:
    t.write(res_img.content)
    img_path = t.name

doc2 = fitz.open(img_path)
print("IMG is_pdf?", doc2.is_pdf)
doc2.close()
