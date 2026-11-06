import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User, { DASHBOARD_WIDGET_SIZES, type DashboardWidgetSize, type IDashboardWidget } from '../models/User';

/** Most widgets one dashboard may hold. */
const MAX_WIDGETS = 40;
const WIDGET_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/**
 * Checks a layout sent by the client. Widget ids are not checked against a list: the catalogue lives in the
 * frontend, which ignores ids it doesn't know or the user can no longer see.
 */
const parseLayout = (raw: unknown): IDashboardWidget[] | string => {
  if (!Array.isArray(raw)) return 'Layout must be a list of widgets.';
  if (raw.length > MAX_WIDGETS) return `A dashboard can hold at most ${MAX_WIDGETS} widgets.`;
  const seen = new Set<string>();
  const widgets: IDashboardWidget[] = [];
  for (const item of raw) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!WIDGET_ID.test(id)) return 'Invalid widget id.';
    if (seen.has(id)) continue;
    seen.add(id);
    const size: DashboardWidgetSize = DASHBOARD_WIDGET_SIZES.includes(item.size) ? item.size : 'md';
    widgets.push({ id, size });
  }
  return widgets;
};

/** The signed-in user's dashboard layout; `null` means they use the default. */
export const getMyDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id).select('+dashboardLayout').lean();
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }
    res.status(200).json({ success: true, data: { widgets: user.dashboardLayout ?? null } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading your dashboard.', error: error.message });
  }
};

/** Saves the signed-in user's layout. `{ widgets: null }` resets to the default. */
export const saveMyDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const reset = req.body?.widgets === null;
    const widgets = reset ? null : parseLayout(req.body?.widgets);
    if (typeof widgets === 'string') {
      res.status(400).json({ success: false, message: widgets });
      return;
    }

    // Personal preference, not a controlled change: kept out of the audit log.
    const update = widgets ? { $set: { dashboardLayout: widgets } } : { $unset: { dashboardLayout: 1 } };
    const result = await User.updateOne({ _id: req.user?.id }, update, { audit: false, runValidators: true });
    if (result.matchedCount === 0) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }
    res.status(200).json({ success: true, message: reset ? 'Dashboard reset.' : 'Dashboard saved.', data: { widgets } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error saving your dashboard.', error: error.message });
  }
};
