const fs = require('fs');
let code = fs.readFileSync('backend-node/routes/truckContactRoutes.js', 'utf8');

const searchRoute = `
// GET /truck-contacts/search/:truckNo - Fetch by truck number
router.get("/search/:truckNo", async (req, res) => {
  try {
    const col = getCollection();
    const truckNo = req.params.truckNo;
    const contact = await col.findOne({
      $or: [
        { "Truck No ": truckNo },
        { "truck_no": truckNo }
      ]
    });
    
    if (contact) {
      res.json({ success: true, contact });
    } else {
      res.json({ success: false, message: 'Truck not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
`;

if (!code.includes('/search/:truckNo')) {
    code = code.replace('router.get("/", async (req, res) => {', searchRoute + '\nrouter.get("/", async (req, res) => {');
    fs.writeFileSync('backend-node/routes/truckContactRoutes.js', code);
    console.log('Route added successfully');
} else {
    console.log('Route already exists');
}
