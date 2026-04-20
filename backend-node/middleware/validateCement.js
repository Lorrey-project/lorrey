const { body, validationResult } = require('express-validator');

// Define validation rules for a cement register entry. Adjust fields as needed.
const cementValidationRules = [
  body('"SL NO"').optional().isNumeric().withMessage('SL NO must be a number'),
  body('"LOADING DATE"').optional().isISO8601().toDate().withMessage('Invalid loading date'),
  body('"SITE"').optional().isString().trim(),
  body('"OWNER NAME"').optional().isString().trim(),
  // Add more field validators as required for your schema
];

const validateCement = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

module.exports = { cementValidationRules, validateCement };
