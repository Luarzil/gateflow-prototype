## A smoother gate workflow.

Here is the updated Veri Gate walkthrough. We will follow a vehicle through the gate, then look at the inventory and user changes from your latest feedback.

## Driver first.

Start with the driver. Scan the badge or enter the employee number, confirm the record, and continue to the vehicle barcode.

## New barcode? Keep going.

This barcode is not in inventory yet. The workflow accepts it and continues. When the movement is processed, the vehicle is added as ordinary inventory.

## Choose the direction.

Choose the direction, review the details, and submit the movement. After recording it, the scanner returns to the start, ready for the next driver.

## The exit is recorded too.

The same vehicle can leave through the usual driver checks. There is no inventory completion block. A barcode first encountered on exit is also added and logged in this version.

## See what arrived.

In the console, Vehicles Added By Scan shows which records originated at the gate. Supervisors can fill in missing details later. Those details do not delay the vehicle's next movement.

## Edit existing users.

Users now have an Edit action. It opens their existing details, and saving updates that same user. Changes to the user's role are recorded in the audit history.

## One Admin role.

The separate Manager role has been removed. The available roles are Scanner, Fleet Lead, Supervisor, and Admin. Existing Manager user records convert to Admin. These are still prototype accounts; secure login is part of the backend work.

## Approval has a clear threshold.

For a driver authorization override, the approver must be a Fleet Lead or above. A Scanner role cannot approve it. The driver checks remain in place alongside the new inventory behavior.

## Review the history.

Finally, the movement stays in the searchable history. The Android package includes these same revisions. This remains a device-local review build, with shared data and synchronization still ahead.