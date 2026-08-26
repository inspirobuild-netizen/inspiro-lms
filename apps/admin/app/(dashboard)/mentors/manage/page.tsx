import { redirect } from 'next/navigation';

/**
 * Mentor setup used to live here, separately from the mentor workload page.
 * Splitting them was the reason nobody could find mentor management: the
 * obvious nav item led to the read-only half. Both now live at /mentors.
 *
 * Kept as a redirect rather than deleted so existing links and bookmarks
 * still land somewhere useful.
 */
export default function MentorManageRedirect() {
  redirect('/mentors');
}
