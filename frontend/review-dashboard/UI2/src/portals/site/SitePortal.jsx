import React from 'react';
import MobileDashboard from '../common/MobileDashboard';

const SitePortal = ({ 
    onUploadNew, 
    onOpenLorrySlip, 
    onOpenFuelSlip, 
    onOpenRegisters,
    onOpenVouchers,
    onOpenFingerprintManager
}) => {
    return (
        <MobileDashboard 
            onUploadNew={onUploadNew}
            onOpenLorrySlip={onOpenLorrySlip}
            onOpenFuelSlip={onOpenFuelSlip}
            onOpenRegisters={onOpenRegisters}
            onOpenVouchers={onOpenVouchers}
            onOpenFingerprintManager={onOpenFingerprintManager}
        />
    );
};

export default SitePortal;
