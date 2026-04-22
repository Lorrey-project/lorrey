import React from 'react';
import MobileDashboard from '../common/MobileDashboard';

const SitePortal = ({ 
    onUploadNew, 
    onOpenLorrySlip, 
    onOpenFuelSlip, 
    onOpenRegisters,
    onOpenVouchers
}) => {
    return (
        <MobileDashboard 
            onUploadNew={onUploadNew}
            onOpenLorrySlip={onOpenLorrySlip}
            onOpenFuelSlip={onOpenFuelSlip}
            onOpenRegisters={onOpenRegisters}
            onOpenVouchers={onOpenVouchers}
            // onOpenFuelRateSettings is null for Site Admin
        />
    );
};

export default SitePortal;
