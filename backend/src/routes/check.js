import { Router } from 'express';
import { checkBodySchema } from '../validators.js';
import { checkEligibility } from '../fareEngine.js';

const router = Router();

router.post('/', (req, res) => {
  const parse = checkBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid body', details: parse.error.flatten() });
  }
  const result = checkEligibility(parse.data);
  return res.json(result);
});

export default router;

