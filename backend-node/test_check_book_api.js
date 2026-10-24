const axios = require('axios');
const FormData = require('form-data');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/check-book';

async function runApiTests() {
  console.log('====================================================');
  console.log('RUNNING CHECK BOOK HTTP API INTEGRATION TESTS');
  console.log('====================================================\n');

  // Create temporary sample files
  const samplePdfPath = path.join(__dirname, 'temp_sample.pdf');
  const sampleJpgPath = path.join(__dirname, 'temp_sample.jpg');
  fs.writeFileSync(samplePdfPath, '%PDF-1.4 sample pdf content for check test');
  fs.writeFileSync(sampleJpgPath, 'fake-jpeg-binary-content-for-check-test');

  try {
    // Step 1: Initial list
    console.log('1. Fetch initial checks list...');
    const resInit = await axios.get(BASE_URL);
    assert.strictEqual(resInit.data.success, true);
    console.log(`   Initial count: ${resInit.data.count}`);

    // Step 2: Bulk create 3 checks
    console.log('\n2. Testing POST /check-book/bulk (Saving 3 checks at once with attachments)...');
    const form = new FormData();
    const metadata = [
      { checkNumber: '001245', checkAmount: 50000, fileField: 'file_0', remarks: 'First test check' },
      { checkNumber: '001246', checkAmount: 25000, fileField: 'file_1', remarks: 'Second test check' },
      { checkNumber: '001247', checkAmount: 30000, fileField: 'file_2', remarks: 'Third test check' }
    ];
    form.append('checks', JSON.stringify(metadata));
    form.append('file_0', fs.createReadStream(samplePdfPath), { filename: 'check_001245.pdf', contentType: 'application/pdf' });
    form.append('file_1', fs.createReadStream(sampleJpgPath), { filename: 'check_001246.jpg', contentType: 'image/jpeg' });
    form.append('file_2', fs.createReadStream(samplePdfPath), { filename: 'check_001247.pdf', contentType: 'application/pdf' });

    const resBulk = await axios.post(`${BASE_URL}/bulk`, form, {
      headers: form.getHeaders()
    });

    assert.strictEqual(resBulk.data.success, true);
    assert.strictEqual(resBulk.data.count, 3);
    console.log('   ✔ 3 checks saved successfully in 1 operation.');

    // Step 3: Verify preservation of string check numbers (with leading zeros)
    console.log('\n3. Verifying check number string preservation (001245)...');
    const resList = await axios.get(BASE_URL);
    const check1 = resList.data.checks.find(c => c.checkNumber === '001245');
    assert.ok(check1, 'Check 001245 must exist in DB');
    assert.strictEqual(check1.checkNumber, '001245', 'Must preserve leading zeros as string');
    assert.strictEqual(check1.checkAmount, 50000);
    assert.ok(check1.documentUrl, 'Must have documentUrl');
    console.log(`   ✔ Check #001245 preserved correctly with doc: ${check1.documentName}`);

    // Step 4: Duplicate check number test
    console.log('\n4. Testing duplicate check number prevention...');
    let dupeError = null;
    const dupeForm = new FormData();
    dupeForm.append('checks', JSON.stringify([
      { checkNumber: '001245', checkAmount: 10000, fileField: 'file_0' }
    ]));
    dupeForm.append('file_0', fs.createReadStream(sampleJpgPath), { filename: 'dupe.jpg', contentType: 'image/jpeg' });

    try {
      await axios.post(`${BASE_URL}/bulk`, dupeForm, { headers: dupeForm.getHeaders() });
    } catch (err) {
      dupeError = err.response?.data?.error;
    }
    assert.ok(dupeError && dupeError.includes('already exists'), 'Must reject duplicate check number');
    console.log(`   ✔ Duplicate check successfully rejected with message: "${dupeError}"`);

    // Step 5: Test Edit check
    console.log('\n5. Testing PUT /check-book/:id (editing Check #001246)...');
    const check2 = resList.data.checks.find(c => c.checkNumber === '001246');
    assert.ok(check2, 'Check 001246 must exist');
    const editForm = new FormData();
    editForm.append('checkNumber', '001246');
    editForm.append('checkAmount', '28000');
    editForm.append('remarks', 'Updated to ₹28,000');
    const resEdit = await axios.put(`${BASE_URL}/${check2._id}`, editForm, { headers: editForm.getHeaders() });
    assert.strictEqual(resEdit.data.success, true);
    assert.strictEqual(resEdit.data.check.checkAmount, 28000);
    console.log('   ✔ Check #001246 amount updated to ₹28,000');

    // Step 6: Test Delete check
    console.log('\n6. Testing DELETE /check-book/:id (deleting Check #001247)...');
    const check3 = resList.data.checks.find(c => c.checkNumber === '001247');
    assert.ok(check3, 'Check 001247 must exist');
    const resDel = await axios.delete(`${BASE_URL}/${check3._id}`);
    assert.strictEqual(resDel.data.success, true);
    console.log('   ✔ Check #001247 deleted successfully.');

    // Step 7: Final list verification
    console.log('\n7. Final checks list verification...');
    const resFinal = await axios.get(BASE_URL);
    assert.strictEqual(resFinal.data.count, 2);
    assert.strictEqual(resFinal.data.totalAmount, 78000); // 50000 + 28000
    console.log(`   ✔ Remaining checks: ${resFinal.data.count}, Total Amount: ₹${resFinal.data.totalAmount}`);

    console.log('\n====================================================');
    console.log('ALL CHECK BOOK HTTP API TESTS COMPLETED SUCCESSFULLY!');
    console.log('====================================================');

    // Clean up created test records
    await axios.delete(`${BASE_URL}/${check1._id}`);
    await axios.delete(`${BASE_URL}/${check2._id}`);
    console.log('✔ Test records cleaned up.');

  } finally {
    if (fs.existsSync(samplePdfPath)) fs.unlinkSync(samplePdfPath);
    if (fs.existsSync(sampleJpgPath)) fs.unlinkSync(sampleJpgPath);
  }
}

runApiTests().catch(err => {
  console.error('API Test Failed:', err.code, err.message, err.response?.data);
  process.exit(1);
});
