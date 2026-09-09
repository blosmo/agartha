import time
import unittest
from unittest.mock import Mock
from .turnaround import FRAMES, frames_code, remaining_seconds, render_turnaround

class TurnaroundTests(unittest.TestCase):
    def test_frames_are_bounded_to_one_orbit_and_small_chunks(self):
        for start, stop in [(-1, 1), (0, 9), (FRAMES - 1, FRAMES + 1), (4, 4)]:
            with self.assertRaises(ValueError): frames_code(start, stop)
        self.assertIn(f'range({FRAMES - 8}, {FRAMES})', frames_code(FRAMES - 8, FRAMES))
        self.assertIn(f'frame / {FRAMES}', frames_code(FRAMES - 8, FRAMES))

    def test_exhausted_reservation_never_starts_rendering_or_downloads(self):
        broker = Mock()
        broker.owned.return_value = {'status': 'running', 'launchClaimedAt': (time.time() - 590) * 1000, 'reservedMinutes': 10}
        with self.assertRaisesRegex(RuntimeError, 'Insufficient'):
            render_turnaround(broker, 'token', 'reservation')
        broker.download.assert_not_called()
        self.assertTrue(all(call.args[3].endswith('-cleanup') for call in broker.call.call_args_list))

    def test_stopped_reservation_cannot_be_restarted_by_video(self):
        broker = Mock(); broker.owned.return_value = {'status': 'settled'}
        with self.assertRaises(RuntimeError): render_turnaround(broker, 'token', 'reservation')
        broker.start.assert_not_called(); broker.download.assert_not_called()
