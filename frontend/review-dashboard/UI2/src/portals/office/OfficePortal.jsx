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
    onOpenFingerprintManager
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
            onOpenFingerprintManager={onOpenFingerprintManager}
        />
    );
};

export default OfficePortal;
