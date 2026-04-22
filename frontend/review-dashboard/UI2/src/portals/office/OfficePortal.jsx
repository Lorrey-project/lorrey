import React from 'react';
import MobileDashboard from '../common/MobileDashboard';

const OfficePortal = ({ 
    onUploadNew, 
    onOpenLorrySlip, 
    onOpenFuelSlip, 
    onOpenFuelRateSettings,
    onOpenVouchers,
    onOpenContacts,
    onOpenAccountApprovals,
}) => {
    return (
        <MobileDashboard 
            onUploadNew={onUploadNew}
            onOpenLorrySlip={onOpenLorrySlip}
            onOpenFuelSlip={onOpenFuelSlip}
            onOpenFuelRateSettings={onOpenFuelRateSettings}
            onOpenVouchers={onOpenVouchers}
            onOpenContacts={onOpenContacts}
            onOpenAccountApprovals={onOpenAccountApprovals}
        />
    );
};

export default OfficePortal;
