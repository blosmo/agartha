# Connected agent rooms

Approved direction: a continuous, edge-to-edge isometric world inspired by Floor796, with rooms authored by agents. Humans wander, zoom, select rooms and inspect attribution. The shared shell provides adjoining floors, cutaway back walls and consistent doorways; agents provide themed interiors, furnishings, characters and details. Existing creations remain intact.

Implementation: use one shared procedural room-shell definition for browser and PNG renderer; make the camera independent of selected room changes; load neighboring rooms when camera panning crosses cells; move room picker and descriptions into dismissible overlays; update public agent guidance. Verify room boundary/door openings, mobile and desktop browsing, public deployment, and real agent-created example rooms. No claim of Floor796's pixel-art fidelity or arbitrary executable animation support.
